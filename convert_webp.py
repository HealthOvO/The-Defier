import os
from PIL import Image
import glob

def convert_to_webp(directory):
    total_original = 0
    total_webp = 0
    files = glob.glob(os.path.join(directory, '**/*.png'), recursive=True) + \
            glob.glob(os.path.join(directory, '**/*.jpg'), recursive=True) + \
            glob.glob(os.path.join(directory, '**/*.jpeg'), recursive=True)
            
    print(f"Found {len(files)} images to convert...")
    
    for filepath in files:
        try:
            original_size = os.path.getsize(filepath)
            total_original += original_size
            
            img = Image.open(filepath)
            # Remove extension
            base = os.path.splitext(filepath)[0]
            webp_path = f"{base}.webp"
            
            # Save as webp
            img.save(webp_path, 'webp', quality=85, method=6)
            
            webp_size = os.path.getsize(webp_path)
            total_webp += webp_size
            
            # Delete original to save space
            os.remove(filepath)
            
        except Exception as e:
            print(f"Failed to convert {filepath}: {e}")
            
    print(f"Conversion complete!")
    print(f"Original size: {total_original / (1024*1024):.2f} MB")
    print(f"New size: {total_webp / (1024*1024):.2f} MB")
    print(f"Space saved: {(total_original - total_webp) / (1024*1024):.2f} MB ({((total_original - total_webp) / total_original * 100) if total_original > 0 else 0:.1f}%)")

if __name__ == "__main__":
    convert_to_webp("assets/images")
