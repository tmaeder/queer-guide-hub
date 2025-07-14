-- Move toy-related items from roles to toys category
UPDATE public.tags 
SET category = 'toys'
WHERE name IN ('Boy Toy', 'chew toy', 'Fucktoy', 'Squishy toy', 'toy', 'Toymaker')
AND category = 'roles';