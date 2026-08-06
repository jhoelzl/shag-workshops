-- Create public storage bucket for class images if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public',
  'public',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Create policy to allow public read access to class-images folder
CREATE POLICY "Allow public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'public');

-- Create policy to allow authenticated users to upload to class-images folder
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'public'
  AND (storage.foldername(name))[1] = 'class-images'
);

-- Create policy to allow authenticated users to delete their uploads
CREATE POLICY "Allow authenticated deletes"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'public'
  AND (storage.foldername(name))[1] = 'class-images'
);
