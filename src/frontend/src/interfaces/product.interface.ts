import type { User } from './user.interface';

export interface Product {
  id: string;
  title: string;
  price: number;
  description: string;
  slug: string;
  stock: number;
  sizes: Size[];
  gender: Gender;
  tags: string[];
  images: string[];
  // La API ya no devuelve el propietario del producto en sus respuestas.
  user?: User;
}

export type Size = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';

export type Gender = 'kid' | 'men' | 'women' | 'unisex';
