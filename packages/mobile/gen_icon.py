from PIL import Image, ImageDraw, ImageFont
import os

size = 1024
img = Image.new('RGBA', (size, size), (10, 10, 10, 255))
draw = ImageDraw.Draw(img)

margin = 80
draw.rounded_rectangle([margin, margin, size-margin, size-margin], radius=180, fill=(59, 130, 246, 255))

try:
    font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 320)
except:
    font = ImageFont.load_default()
draw.text((size//2, size//2 - 20), 'OC', fill=(255, 255, 255, 255), font=font, anchor='mm')

badge_size = 220
badge_x = size - margin - badge_size + 30
badge_y = size - margin - badge_size + 30
draw.rounded_rectangle([badge_x, badge_y, badge_x+badge_size, badge_y+badge_size], radius=40, fill=(30, 30, 30, 230))
try:
    badge_font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 100)
except:
    badge_font = ImageFont.load_default()
draw.text((badge_x+badge_size//2, badge_y+badge_size//2), 'AI', fill=(96, 165, 250, 255), font=badge_font, anchor='mm')

os.makedirs('assets', exist_ok=True)
img.save('assets/icon.png')
print('Icon created successfully')
