"""
Seeding script to upload processed NHANES diet and symptoms dataset to Supabase.
"""

import os
import sys
from pathlib import Path
import pandas as pd
import numpy as np
from dotenv import load_dotenv

# Ensure RecommenderSys is in python search path
sys.path.append(str(Path(__file__).resolve().parent))

# Try loading supabase client
try:
    from supabase import create_client, Client
except ImportError:
    print("Error: 'supabase' package is not installed. Please run: pip install supabase python-dotenv pandas")
    sys.exit(1)


def load_supabase_client() -> Client:
    """Load configuration from root .env and return a Supabase Client."""
    root_dir = Path(__file__).resolve().parent.parent
    env_path = root_dir / ".env"
    
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
    else:
        load_dotenv()
        
    url = os.getenv("VITE_SUPABASE_URL")
    # For server-side administrative writes, use the service_role key to bypass RLS.
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_PUBLISHABLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")
    
    if not url or not key:
        print("[Error] Supabase credentials missing in .env file.")
        print("Please ensure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY) are set.")
        sys.exit(1)
        
    return create_client(url, key)


def seed_nhanes_data():
    supabase = load_supabase_client()
    
    # Path configurations
    csv_path = Path(__file__).resolve().parent / "data" / "NHANES_csv" / "nhanes_merged_diet_symptoms.csv"
    
    if not csv_path.exists():
        print(f"[Error] Processed CSV file not found at: {csv_path}")
        print("Please run 'python convert_nhanes.py' first to generate the CSV.")
        sys.exit(1)
        
    print(f"Loading dataset from: {csv_path} ...")
    # Read CSV. Using low_memory=False to avoid DtypeWarning.
    df = pd.read_csv(csv_path, low_memory=False)
    print(f"Loaded {len(df)} records. Preparing for upload...")
    
    # Define columns to insert
    cols = list(df.columns)
    
    # Convert dataframe to list of dicts with NaN handled as None (JSON null)
    records = []
    for _, row in df.iterrows():
        record = {}
        for col in cols:
            val = row[col]
            if pd.isna(val) or (isinstance(val, float) and np.isnan(val)):
                record[col] = None
            elif col in ['seqn', 'food_code', 'day']:
                record[col] = int(val)
            elif col in ['amount_g']:
                record[col] = float(val)
            elif col in ['food_description', 'food_group']:
                record[col] = str(val)
            else:
                # Bowel health question columns
                record[col] = int(val)
        records.append(record)

    total_records = len(records)
    print(f"Seeding {total_records} records into public.nhanes_merged_diet_symptoms in Supabase...")
    
    # Bulk insert in chunks of 2000
    chunk_size = 2000
    for i in range(0, total_records, chunk_size):
        chunk = records[i : i + chunk_size]
        try:
            # We use insert because we are seeding a new table.
            # (Use upsert if you want to support repeated runs cleanly, but insert is fine)
            supabase.table("nhanes_merged_diet_symptoms").insert(chunk).execute()
            print(f"  Uploaded items {i+1} to {min(i+chunk_size, total_records)}")
        except Exception as e:
            print(f"  [Error] Failed to seed chunk starting at index {i}: {e}")
            # Ask user if they applied the schema
            print("  Please make sure you have applied the migration schema in the Supabase SQL editor.")
            print("  The schema is located at: supabase/migrations/20260614000000_create_nhanes_tables.sql")
            sys.exit(1)
            
    print("\n[Success] NHANES dataset seeding completed!")


if __name__ == "__main__":
    seed_nhanes_data()
