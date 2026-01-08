"""
High-performance data loader for SIRQ simulation experiments.

Supports Parquet format for fast I/O and efficient memory usage.
"""

import pandas as pd
import numpy as np
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, Dict, List
import json


@dataclass
class CalibrationData:
    """Calibration parameters from real-world charging data."""
    # Arrival patterns
    hourly_prob: np.ndarray  # 24-element array
    dow_multiplier: np.ndarray  # 7-element array

    # Session statistics
    duration_mean: float
    duration_std: float

    # Energy statistics
    energy_mean_kwh: float
    energy_std_kwh: float

    # SOC statistics
    soc_arrival_mean: float
    soc_arrival_std: float

    # Battery statistics
    capacity_mean_kwh: float
    capacity_std_kwh: float

    # Metadata
    source: str
    num_chargers: int
    total_sessions: int


class DataLoader:
    """Fast data loader with caching and Parquet support."""

    def __init__(self, data_dir: str = None):
        self.data_dir = Path(data_dir) if data_dir else Path(__file__).parent.parent
        self._calibration: Optional[CalibrationData] = None
        self._sessions_df: Optional[pd.DataFrame] = None

    def load_epfl_excel(self, excel_path: str) -> pd.DataFrame:
        """Load raw EPFL Excel data and convert to efficient format."""
        df = pd.read_excel(excel_path)
        return df

    def convert_to_parquet(self, excel_path: str, output_path: str = None):
        """Convert Excel to Parquet for faster loading."""
        df = self.load_epfl_excel(excel_path)

        # Optimize data types
        df['arrival_hour'] = df['Arrival'].dt.hour.astype(np.int8)
        df['arrival_minute'] = df['Arrival'].dt.minute.astype(np.int8)
        df['arrival_dow'] = df['Arrival'].dt.dayofweek.astype(np.int8)
        df['stay_min'] = df['Stay (min)'].astype(np.int16)
        df['energy_kwh'] = (df['Energy (Wh)'] / 1000).astype(np.float32)
        df['soc_arrival'] = df['SOC arrival'].astype(np.float32)
        df['soc_departure'] = df['SOC departure'].astype(np.float32)

        # Select columns
        output_df = df[[
            'Session', 'CCS', 'arrival_hour', 'arrival_minute', 'arrival_dow',
            'stay_min', 'energy_kwh', 'soc_arrival', 'soc_departure'
        ]].copy()

        output_path = output_path or str(self.data_dir / 'epfl_sessions.parquet')
        output_df.to_parquet(output_path, engine='pyarrow', compression='snappy')
        print(f"Saved {len(output_df)} sessions to {output_path}")
        return output_df

    def load_sessions(self, parquet_path: str = None) -> pd.DataFrame:
        """Load sessions from Parquet file."""
        if self._sessions_df is not None:
            return self._sessions_df

        path = parquet_path or str(self.data_dir / 'epfl_sessions.parquet')
        self._sessions_df = pd.read_parquet(path)
        return self._sessions_df

    def compute_calibration(self, df: pd.DataFrame = None) -> CalibrationData:
        """Compute calibration parameters from session data."""
        if self._calibration is not None:
            return self._calibration

        if df is None:
            df = self.load_sessions()

        # Hourly arrival probabilities
        total_days = 449  # From EPFL dataset metadata
        hourly_counts = df['arrival_hour'].value_counts().sort_index()
        hourly_prob = np.zeros(24, dtype=np.float64)
        for h in range(24):
            count = hourly_counts.get(h, 0)
            hourly_prob[h] = (count / total_days) / 60  # prob per minute

        # Day of week multipliers
        dow_counts = df['arrival_dow'].value_counts().sort_index()
        dow_mean = dow_counts.mean()
        dow_multiplier = np.array([dow_counts.get(d, dow_mean) / dow_mean for d in range(7)])

        self._calibration = CalibrationData(
            hourly_prob=hourly_prob,
            dow_multiplier=dow_multiplier,
            duration_mean=df['stay_min'].mean(),
            duration_std=df['stay_min'].std(),
            energy_mean_kwh=df['energy_kwh'].mean(),
            energy_std_kwh=df['energy_kwh'].std(),
            soc_arrival_mean=df['soc_arrival'].dropna().mean(),
            soc_arrival_std=df['soc_arrival'].dropna().std(),
            capacity_mean_kwh=69.7,  # From EPFL metadata
            capacity_std_kwh=30.2,
            source="EPFL Level-3 EV Charging Dataset",
            num_chargers=2,
            total_sessions=len(df)
        )

        return self._calibration

    def get_arrival_probability(self, time_of_day_minutes: int, day_of_week: int = 0,
                                 scale_factor: float = 1.0) -> float:
        """Get arrival probability for specific time."""
        cal = self.compute_calibration()
        hour = (time_of_day_minutes // 60) % 24
        return cal.hourly_prob[hour] * cal.dow_multiplier[day_of_week] * scale_factor

    def save_calibration_numpy(self, output_path: str = None):
        """Save calibration as NumPy binary for fastest loading."""
        cal = self.compute_calibration()
        output_path = output_path or str(self.data_dir / 'epfl_calibration.npz')

        np.savez_compressed(
            output_path,
            hourly_prob=cal.hourly_prob,
            dow_multiplier=cal.dow_multiplier,
            stats=np.array([
                cal.duration_mean, cal.duration_std,
                cal.energy_mean_kwh, cal.energy_std_kwh,
                cal.soc_arrival_mean, cal.soc_arrival_std,
                cal.capacity_mean_kwh, cal.capacity_std_kwh
            ])
        )
        print(f"Saved calibration to {output_path}")

    def load_calibration_numpy(self, npz_path: str = None) -> CalibrationData:
        """Load calibration from NumPy binary (fastest)."""
        path = npz_path or str(self.data_dir / 'epfl_calibration.npz')
        data = np.load(path)

        stats = data['stats']
        self._calibration = CalibrationData(
            hourly_prob=data['hourly_prob'],
            dow_multiplier=data['dow_multiplier'],
            duration_mean=stats[0],
            duration_std=stats[1],
            energy_mean_kwh=stats[2],
            energy_std_kwh=stats[3],
            soc_arrival_mean=stats[4],
            soc_arrival_std=stats[5],
            capacity_mean_kwh=stats[6],
            capacity_std_kwh=stats[7],
            source="EPFL (from NPZ)",
            num_chargers=2,
            total_sessions=1878
        )
        return self._calibration


def convert_epfl_data():
    """Convert EPFL Excel data to optimized formats."""
    loader = DataLoader()

    # Path to EPFL data
    excel_path = '/home/rodrigues/epfl-ev-dataset/Session_data.xlsx'

    # Convert to Parquet
    df = loader.convert_to_parquet(excel_path, '/home/rodrigues/sirq-ts/epfl_sessions.parquet')

    # Compute and save calibration
    loader.compute_calibration(df)
    loader.save_calibration_numpy('/home/rodrigues/sirq-ts/epfl_calibration.npz')

    return loader


if __name__ == '__main__':
    convert_epfl_data()
