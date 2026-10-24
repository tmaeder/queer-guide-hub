#!/usr/bin/env python3
"""Verify ordinary quality reassessment prioritizes changed facts without data edits."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
ROOT=Path(__file__).resolve().parents[3]
def binary(name):
    return str(Path(os.environ['PG_BINDIR'])/name) if os.environ.get('PG_BINDIR') else shutil.which(name)
sql=(Path(__file__).with_name('business_quality_changed_priority.sql')).read_text()
sql+=(ROOT/'supabase/migrations/99991792803000_business_quality_changed_priority.sql').read_text()
sql+="""
do $after$begin
 assert(refresh_business_brand_quality())[1]=3000,'Changed profile was starved';
 assert(refresh_business_brand_quality())[2]=3001,'Unchecked profile lost priority over daily checks';
 assert cardinality(refresh_business_brand_quality())=2000,'Batch bound changed';
 assert not(3002=any(refresh_business_brand_quality())),'Duplicate became eligible';
 assert(select count(*)from organizations)=2004,'Priority patch changed profile data';
 assert(select prosecdef from pg_proc where oid='refresh_business_brand_quality()'::regprocedure),'Function security changed';
end $after$;
"""
with tempfile.TemporaryDirectory(prefix='qg-business-quality-priority-')as tmp:
    data=Path(tmp)/'data'
    subprocess.run([binary('initdb'),'-D',str(data),'-A','trust','--no-locale','--wal-segsize=1'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([binary('pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55505 -c listen_addresses= -c min_wal_size=2MB -c max_wal_size=16MB','-w','start'],check=True,stdout=subprocess.DEVNULL)
    try:subprocess.run([binary('psql'),'-h',tmp,'-p','55505','-d','postgres','-v','ON_ERROR_STOP=1'],input=sql,text=True,check=True)
    finally:subprocess.run([binary('pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
