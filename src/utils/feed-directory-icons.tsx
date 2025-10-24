/**
 * Icon mapping for feed categories and subcategories
 */

import {
  Atom,
  Bike,
  Book,
  Briefcase,
  Building,
  Code,
  Cpu,
  Droplet,
  Dumbbell,
  Film,
  Globe,
  GraduationCap,
  HeartPulse,
  Leaf,
  LucideIcon,
  MessageSquare,
  Microscope,
  Music,
  Newspaper,
  Palette,
  Radio,
  Rocket,
  Scale,
  ShieldCheck,
  Smartphone,
  Sun,
  TreePine,
  TrendingUp,
  Trophy,
  Tv,
  Users,
} from 'lucide-react'

type IconMap = Record<string, LucideIcon>

/**
 * Map of category/subcategory names to their corresponding icons
 * Using lowercase keys for case-insensitive matching
 */
export const categoryIconMap: IconMap = {
  // Press / News
  presse: Newspaper,
  press: Newspaper,
  news: Newspaper,
  actualité: Newspaper,
  actualites: Newspaper,
  généraliste: Newspaper,
  generaliste: Newspaper,
  standard: Newspaper,
  monde: Globe,
  world: Globe,
  international: Globe,
  société: Users,
  societe: Users,
  society: Users,
  tribune: MessageSquare,
  alternatif: MessageSquare,
  régional: Radio,
  regional: Radio,
  
  // Environment
  environnement: Leaf,
  environment: Leaf,
  vert: TreePine,
  green: TreePine,
  santé: HeartPulse,
  sante: HeartPulse,
  health: HeartPulse,
  eau: Droplet,
  water: Droplet,
  climat: Sun,
  climate: Sun,
  
  // Science & Tech
  science: Atom,
  sciences: Atom,
  tech: Cpu,
  technology: Cpu,
  technologie: Cpu,
  informatique: Code,
  computer: Code,
  numérique: Smartphone,
  numerique: Smartphone,
  digital: Smartphone,
  recherche: Microscope,
  research: Microscope,
  espace: Rocket,
  space: Rocket,
  innovation: Rocket,
  
  // Sport
  sport: Trophy,
  sports: Trophy,
  football: Trophy,
  cyclisme: Bike,
  cycling: Bike,
  fitness: Dumbbell,
  
  // Culture
  culture: Palette,
  art: Palette,
  musique: Music,
  music: Music,
  cinéma: Film,
  cinema: Film,
  film: Film,
  livre: Book,
  book: Book,
  livres: Book,
  books: Book,
  
  // Business / Economy
  économie: TrendingUp,
  economie: TrendingUp,
  economy: TrendingUp,
  business: Briefcase,
  entreprise: Building,
  company: Building,
  finance: TrendingUp,
  
  // Media
  média: Tv,
  media: Tv,
  radio: Radio,
  télé: Tv,
  tele: Tv,
  television: Tv,
  
  // Politics / Law
  politique: Scale,
  politics: Scale,
  justice: Scale,
  law: Scale,
  droit: Scale,
  défense: ShieldCheck,
  defense: ShieldCheck,
  
  // Education
  éducation: GraduationCap,
  education: GraduationCap,
  université: GraduationCap,
  university: GraduationCap,
}

/**
 * Get icon for a category or subcategory name
 * Falls back to a default icon if not found
 */
export function getCategoryIcon(name: string): LucideIcon {
  const normalizedName = name.toLowerCase().trim()
  
  // Try exact match first
  if (categoryIconMap[normalizedName]) {
    return categoryIconMap[normalizedName]
  }
  
  // Try partial match
  for (const [key, icon] of Object.entries(categoryIconMap)) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return icon
    }
  }
  
  // Default fallback
  return Newspaper
}

/**
 * Get a color class for a category (for visual variety)
 */
export function getCategoryColor(index: number): string {
  const colors = [
    'text-blue-500',
    'text-green-500',
    'text-purple-500',
    'text-orange-500',
    'text-pink-500',
    'text-cyan-500',
    'text-yellow-500',
    'text-red-500',
    'text-indigo-500',
    'text-teal-500',
  ]
  
  return colors[index % colors.length]
}
