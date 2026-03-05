-- Aurora Charmie seed data
-- Run after schema.sql

insert into public.products (name, price, category, description, is_new, color, image_path)
values
  (
    'Cherry Bloom',
    'Rp 35.000',
    'Cherry',
    'Sweet and playful red cherry bead bracelet.',
    false,
    '#F4A7A7',
    'https://i.pinimg.com/736x/63/a4/85/63a4851f46c293cd70b0b2b0483d0a24.jpg'
  ),
  (
    'Daisy Charm',
    'Rp 40.000',
    'Flower',
    'White daisy flower bracelet with gold beads.',
    false,
    '#FFE4B5',
    'https://source.unsplash.com/400x300/?bracelet,flower,daisy'
  ),
  (
    'Cloudy Heart',
    'Rp 32.000',
    'Heart',
    'Soft pastel heart bracelet in lavender and pink.',
    true,
    '#E8D5F5',
    'https://source.unsplash.com/400x300/?bracelet,heart,pastel'
  ),
  (
    'Mellow Beads',
    'Rp 38.000',
    'Mix',
    'A cheerful mix of colorful beads.',
    false,
    '#FFD6A5',
    'https://source.unsplash.com/400x300/?bracelet,colorful,beads'
  ),
  (
    'Sakura Pearl',
    'Rp 45.000',
    'Pastel',
    'Pastel pearl beads in soft pink tones.',
    true,
    '#FADADD',
    'https://source.unsplash.com/400x300/?bracelet,pearl,pink'
  ),
  (
    'Berry Twist',
    'Rp 33.000',
    'Cherry',
    'Cherry bracelet with a purple and pink twist.',
    false,
    '#DDA0DD',
    'https://source.unsplash.com/400x300/?bracelet,purple,beads'
  )
on conflict do nothing;
