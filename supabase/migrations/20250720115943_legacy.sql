-- Add LGBTI-related attributes to countries table based on ILGA database structure

ALTER TABLE public.countries 
ADD COLUMN IF NOT EXISTS lgbti_criminalization JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS lgbti_expression_restrictions JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS lgbti_association_restrictions JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS lgbti_constitutional_protection JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS lgbti_goods_services_protection JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS lgbti_health_protection JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS lgbti_education_protection JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS lgbti_bullying_protection JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS lgbti_employment_protection JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS lgbti_housing_protection JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS lgbti_hate_crime_law JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS lgbti_incitement_prohibition JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS lgbti_conversion_therapy_regulation TEXT,
ADD COLUMN IF NOT EXISTS lgbti_same_sex_unions TEXT,
ADD COLUMN IF NOT EXISTS lgbti_adoption_rights TEXT,
ADD COLUMN IF NOT EXISTS lgbti_intersex_protection TEXT,
ADD COLUMN IF NOT EXISTS lgbti_gender_recognition JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS lgbti_data_last_updated TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Add index for LGBTI data queries
CREATE INDEX IF NOT EXISTS idx_countries_lgbti_criminalization ON public.countries USING GIN(lgbti_criminalization);
CREATE INDEX IF NOT EXISTS idx_countries_lgbti_same_sex_unions ON public.countries(lgbti_same_sex_unions);
CREATE INDEX IF NOT EXISTS idx_countries_lgbti_adoption_rights ON public.countries(lgbti_adoption_rights);

-- Add comments for documentation
COMMENT ON COLUMN public.countries.lgbti_criminalization IS 'JSONB containing criminalization status, penalties, enforcement details';
COMMENT ON COLUMN public.countries.lgbti_expression_restrictions IS 'JSONB containing freedom of expression barriers and mechanisms';
COMMENT ON COLUMN public.countries.lgbti_association_restrictions IS 'JSONB containing freedom of association barriers';
COMMENT ON COLUMN public.countries.lgbti_constitutional_protection IS 'JSONB containing SO, GI, GE, SC protection status';
COMMENT ON COLUMN public.countries.lgbti_goods_services_protection IS 'JSONB containing protection status for SO, GI, GE, SC in goods/services';
COMMENT ON COLUMN public.countries.lgbti_health_protection IS 'JSONB containing protection status for SO, GI, GE, SC in healthcare';
COMMENT ON COLUMN public.countries.lgbti_education_protection IS 'JSONB containing protection status for SO, GI, GE, SC in education';
COMMENT ON COLUMN public.countries.lgbti_employment_protection IS 'JSONB containing protection status for SO, GI, GE, SC in employment';
COMMENT ON COLUMN public.countries.lgbti_housing_protection IS 'JSONB containing protection status for SO, GI, GE, SC in housing';
COMMENT ON COLUMN public.countries.lgbti_hate_crime_law IS 'JSONB containing hate crime law status for SO, GI, GE, SC';
COMMENT ON COLUMN public.countries.lgbti_incitement_prohibition IS 'JSONB containing incitement prohibition status for SO, GI, GE, SC';
COMMENT ON COLUMN public.countries.lgbti_gender_recognition IS 'JSONB containing legal gender recognition procedures and requirements';