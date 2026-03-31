-- Optional demo catalog (run after 001_init.sql)
insert into public.suppliers (name, contact_info) values
  ('Metro Pharma Wholesaler', '+63 2 0000 0000');

insert into public.products (name, category, price, stock_quantity, min_stock_level, is_active) values
  ('Paracetamol 500mg', 'OTC', 6.50, 120, 20, true),
  ('Vitamin C 1000mg', 'Vitamins', 12.00, 45, 10, true),
  ('ORS Sachets', 'Hydration', 8.25, 80, 15, true),
  ('Digital thermometer', 'Devices', 185.00, 6, 2, true),
  ('Isopropyl alcohol 500ml', 'First aid', 55.00, 40, 8, true);
