import os
import pandas as pd
from pathlib import Path

def get_food_group(code):
    if pd.isna(code):
        return "Unknown"
    # USDA food codes are 8 digits. The first digit represents the major food group.
    code_str = str(int(code)).strip()
    if not code_str:
        return "Unknown"
    first_digit = code_str[0]
    groups = {
        '1': 'Dairy',
        '2': 'Meat/Poultry/Fish',
        '3': 'Eggs',
        '4': 'Legumes/Nuts/Seeds',
        '5': 'Grains',
        '6': 'Fruits',
        '7': 'Vegetables',
        '8': 'Fats/Oils',
        '9': 'Sugars/Beverages'
    }
    return groups.get(first_digit, 'Unknown')

def main():
    # Setup paths
    base_dir = Path(__file__).resolve().parent
    nhanes_dir = base_dir / "data" / "NHANES"
    output_dir = base_dir / "data" / "NHANES_csv"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    bhq_path = nhanes_dir / "BHQ_F.xpt"
    dr1_path = nhanes_dir / "DR1IFF_F.xpt"
    dr2_path = nhanes_dir / "DR2IFF_F.xpt"
    drxfcd_path = nhanes_dir / "DRXFCD_F.xpt"
    
    print("Step 1: Loading and processing Bowel Health Questionnaire (BHQ_F)...")
    bhq_df = pd.read_sas(bhq_path, format="xport")
    bhq_df.columns = [c.upper() for c in bhq_df.columns]
    
    bhq_rename_map = {
        'SEQN': 'seqn',
        'BHQ005': 'check_item',
        'BHQ010': 'bowel_leakage_gas',
        'BHQ020': 'bowel_leakage_mucus',
        'BHQ030': 'bowel_leakage_liquid',
        'BHQ040': 'bowel_leakage_solid',
        'BHD050': 'stool_frequency',
        'BHQ060': 'stool_type',
        'BHQ070': 'bowel_urgency',
        'BHQ080': 'constipation',
        'BHQ090': 'diarrhea',
        'BHQ100': 'laxative_taken',
        'BHQ110': 'laxative_frequency'
    }
    
    # Keep only columns that exist
    actual_rename_map = {k: v for k, v in bhq_rename_map.items() if k in bhq_df.columns}
    bhq_df = bhq_df[list(actual_rename_map.keys())].copy()
    bhq_df = bhq_df.rename(columns=actual_rename_map)
    
    bhq_df = bhq_df.dropna(subset=['seqn'])
    bhq_df['seqn'] = bhq_df['seqn'].astype(int)
    
    # Cast symptom responses to nullable integers (Int64)
    for col in bhq_df.columns:
        if col != 'seqn':
            bhq_df[col] = bhq_df[col].astype('Int64')
            
    print(f"Loaded Bowel Health questionnaire with {len(bhq_df)} participants.")
    
    print("\nStep 2: Loading and processing Food Dictionary (DRXFCD_F)...")
    fcd_df = pd.read_sas(drxfcd_path, format="xport")
    fcd_df.columns = [c.upper() for c in fcd_df.columns]
    
    fcd_df = fcd_df.rename(columns={
        'DRXFDCD': 'food_code',
        'DRXFCSD': 'food_description_short',
        'DRXFCLD': 'food_description'
    })
    
    # Decode bytes to strings
    for col in ['food_description', 'food_description_short']:
        if col in fcd_df.columns:
            fcd_df[col] = fcd_df[col].apply(lambda x: x.decode('utf-8', errors='ignore') if isinstance(x, bytes) else x)
            
    fcd_df = fcd_df.dropna(subset=['food_code'])
    fcd_df['food_code'] = fcd_df['food_code'].astype(int)
    fcd_df['food_group'] = fcd_df['food_code'].apply(get_food_group)
    
    print(f"Loaded Food Dictionary with {len(fcd_df)} food codes.")
    
    print("\nStep 3: Loading and processing Day 1 Dietary Recall (DR1IFF_F)...")
    df1 = pd.read_sas(dr1_path, format="xport")
    df1.columns = [c.upper() for c in df1.columns]
    df1 = df1[['SEQN', 'DR1IFDCD', 'DR1IGRMS']].copy()
    df1.columns = ['seqn', 'food_code', 'amount_g']
    df1['day'] = 1
    
    print("\nStep 4: Loading and processing Day 2 Dietary Recall (DR2IFF_F)...")
    df2 = pd.read_sas(dr2_path, format="xport")
    df2.columns = [c.upper() for c in df2.columns]
    df2 = df2[['SEQN', 'DR2IFDCD', 'DR2IGRMS']].copy()
    df2.columns = ['seqn', 'food_code', 'amount_g']
    df2['day'] = 2
    
    print("\nStep 5: Concatenating and cleaning dietary recalls...")
    diet_df = pd.concat([df1, df2], ignore_index=True)
    diet_df = diet_df.dropna(subset=['seqn', 'food_code'])
    diet_df['seqn'] = diet_df['seqn'].astype(int)
    diet_df['food_code'] = diet_df['food_code'].astype(int)
    
    print(f"Total dietary intake records: {len(diet_df)}")
    
    print("\nStep 6: Merging dietary recalls with Bowel Health symptoms...")
    # Inner merge to keep only participants who completed bowel health questions
    merged_df = pd.merge(diet_df, bhq_df, on='seqn', how='inner')
    print(f"Merged with Bowel Health. Remaining records: {len(merged_df)}")
    print(f"Unique participants in merged dataset: {merged_df['seqn'].nunique()}")
    
    print("\nStep 7: Merging with Food Dictionary for descriptions and groups...")
    merged_df = pd.merge(merged_df, fcd_df[['food_code', 'food_description', 'food_group']], on='food_code', how='left')
    
    # Organize columns
    cols_order = [
        'seqn', 'food_code', 'food_description', 'food_group', 'day', 'amount_g',
        'bowel_leakage_gas', 'bowel_leakage_mucus', 'bowel_leakage_liquid', 'bowel_leakage_solid',
        'stool_frequency', 'stool_type', 'bowel_urgency', 'constipation', 'diarrhea',
        'laxative_taken', 'laxative_frequency'
    ]
    cols_order = [c for c in cols_order if c in merged_df.columns]
    merged_df = merged_df[cols_order]
    
    print(f"Final merged dataset row count: {len(merged_df)}")
    
    # Save files
    merged_csv_path = output_dir / "nhanes_merged_diet_symptoms.csv"
    print(f"Saving merged dataset to: {merged_csv_path}")
    merged_df.to_csv(merged_csv_path, index=False)
    
    # Save individual clean files as well in case they are needed
    bhq_df.to_csv(output_dir / "nhanes_bowel_health.csv", index=False)
    fcd_df.to_csv(output_dir / "nhanes_food_codes.csv", index=False)
    
    print("\nStep 8: Generating PostgreSQL database schema...")
    schema_sql_dir = base_dir.parent / "supabase" / "migrations"
    schema_sql_dir.mkdir(parents=True, exist_ok=True)
    schema_sql_path = schema_sql_dir / "20260614000000_create_nhanes_tables.sql"
    
    # Define mapping of pandas dtypes to postgresql types
    # Since bhq columns are Int64, we check for pandas nullable Int64 as well
    sql_cols = []
    for col in cols_order:
        dtype = merged_df[col].dtype
        if col == 'seqn':
            sql_type = "integer not null"
        elif col == 'food_code':
            sql_type = "integer not null"
        elif col == 'day':
            sql_type = "integer not null"
        elif col == 'amount_g':
            sql_type = "double precision not null"
        elif col in ['food_description', 'food_group']:
            sql_type = "text"
        else:
            # Bowel health symptoms are nullable integers
            sql_type = "integer"
        sql_cols.append(f"  {col} {sql_type}")
        
    sql_columns_str = ",\n".join(sql_cols)
    
    create_table_sql = f"""-- Migration to create NHANES merged diet and symptoms table for NMF modeling
create table if not exists public.nhanes_merged_diet_symptoms (
  id bigint generated always as identity primary key,
{sql_columns_str},
  created_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.nhanes_merged_diet_symptoms enable row level security;

-- Create read access policy
create policy "Allow read access to NHANES data for everyone"
on public.nhanes_merged_diet_symptoms
for select
using (true);

-- Create performance indexes for collaborative filtering queries
create index if not exists nhanes_seqn_idx on public.nhanes_merged_diet_symptoms (seqn);
create index if not exists nhanes_food_code_idx on public.nhanes_merged_diet_symptoms (food_code);
create index if not exists nhanes_food_group_idx on public.nhanes_merged_diet_symptoms (food_group);
"""
    
    with open(schema_sql_path, "w", encoding="utf-8") as f:
        f.write(create_table_sql)
        
    print(f"Generated SQL schema migration: {schema_sql_path}")
    print("\nNHANES data processing completed successfully!")

if __name__ == "__main__":
    main()
