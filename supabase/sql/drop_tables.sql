-- Drop tables that are no longer needed
-- This script will drop user_selections and ai_insider_alerts tables

-- Drop user_selections table (if it exists)
DROP TABLE IF EXISTS user_selections CASCADE;

-- Drop ai_insider_alerts table (if it exists)
DROP TABLE IF EXISTS ai_insider_alerts CASCADE;

-- Verify tables are dropped
SELECT 
    table_name,
    'DROPPED' as status
FROM information_schema.tables 
WHERE table_name IN ('user_selections', 'ai_insider_alerts')
AND table_schema = 'public';

-- Show remaining tables for verification
SELECT 
    table_name,
    'EXISTS' as status
FROM information_schema.tables 
WHERE table_schema = 'public'
AND table_name LIKE '%selection%' OR table_name LIKE '%alert%'
ORDER BY table_name;
