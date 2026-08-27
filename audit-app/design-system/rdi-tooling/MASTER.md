# RDI Tooling Management System — Design System Master

## Color Tokens (Tailwind CSS)

| Token | CSS Variable | Hex Value | Usage |
|-------|-------------|-----------|-------|
| `--color-primary` | `--rdi-navy` | `#1E3A5F` | Primary navy — headers, navigation, primary actions |
| `--color-on-primary` | `--rdi-slate-dark` | `#0F172A` | White on primary |
| `--color-secondary` | `--rdi-slate-mute` | `#475569` | Secondary blue — secondary actions |
| `--color-on-secondary` | `--rdi-slate-dark` | `#0F172A` | White on secondary |
| `--color-accent` | `--rdi-green` | `#059669` | Premium green — status AMAN, positive actions |
| `--color-on-accent` | `--rdi-slate-dark` | `#0F172A` | Black on accent |
| `--color-background` | `--rdi-slate` | `#F8FAFC` | Light professional background |
| `--color-foreground` | `--rdi-slate-dark` | `#0F172A` | Primary text |
| `--color-card` | `#FFFFFF` | `#FFFFFF` | Card surfaces |
| `--color-card-foreground` | `--rdi-slate-dark` | `#0F172A` | Text on cards |
| `--color-muted` | `--rdi-slate-light` | `#F1F3F5` | Muted backgrounds, dividers |
| `--color-muted-foreground` | `--rdi-slate-mute` | `#475569` | Secondary text, disabled states |
| `--color-border` | `--rdi-slate-border` | `#E4E7EB` | Borders, separation lines |
| `--color-destructive` | `--rdi-red` | `#DC2626` | Red — status HABIS, destructive actions |
| `--color-on-destructive` | `--rdi-slate-dark` | `#0F172A` | White on destructive |
| `--color-ring` | `--rdi-navy` | `#1E3A5F` | Focus ring, interactive states |

## Typography

- **Sans**: Outfit (weights 300-700) — geometric, modern, clean
- **Heading**: Poppins (weights 400-600) — geometric, strong hierarchy
- **Base Size**: 16px
- **Line Height**: 1.5 (default), 1.25 (tight), 1.75 (loose)
- **Heading Scale**: 2xl(1.875rem), xl(1.5rem), lg(1.25rem), md(1.125rem), sm(1rem), xs(0.875rem)

## Spacing System (8dp Rhythm)

| Token | Value |
|-------|-------|
| `--space-1` | `0.25rem` (4px) |
| `--space-2` | `0.5rem` (8px) |
| `--space-3` | `0.75rem` (12px) |
| `--space-4` | `1rem` (16px) |
| `--space-5` | `1.25rem` (20px) |
| `--space-6` | `1.5rem` (24px) |
| `--space-8` | `2rem` (32px) |
| `--space-10` | `2.5rem` (40px) |
| `--space-12` | `3rem` (48px) |
| `--space-16` | `4rem` (64px) |
| `--space-20` | `5rem` (80px) |
| `--space-24` | `6rem` (96px) |

## Border Radius

- `--radius-sm`: `calc(var(--radius) - 4px)`
- `--radius-md`: `calc(var(--radius) - 2px)`
- `--radius-lg`: `var(--radius)` (default: 0.5rem)
- Flat (`0px`) for industrial premium aesthetic where appropriate

## Breakpoints

| Label | Pixel Range |
|-------|-------------|
| `mobile` | < 640px |
| `tablet` | 640px — 1024px |
| `desktop` | > 1024px |

## Component Guidelines

### Buttons

- **Primary**: `--color-accent` (`#059669`) with `--color-on-accent` (`#000000`)
- **Secondary**: `--color-secondary` (`#2563EB`) with `--color-on-secondary` (`#FFFFFF`)
- **Destructive**: `--color-destructive` (`#DC2626`) with `--color-on-destructive` (`#FFFFFF`)
- **Ghost**: `hover:bg-accent hover:text-accent-foreground`
- **Loading**: Skeleton state, disabled class, spinner inside
- **Focus**: `focus-visible:ring-1 focus-visible:ring-ring`
- **Disabled**: `opacity-50 pointer-events-none`

### Cards

- Background: `#FFFFFF`
- Border: `1px solid #E4E7EB`
- Shadow: `0 1px 2px 0 rgb(0 0 0 / 0.05)`
- Hover: `hover:shadow-lg transition-shadow`

### Tables

- Striped rows: `even:bg-gray-50`
- Hover row: `hover:bg-gray-50`
- Focus cell: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2`
- Font size: `text-sm`

### Forms

- Input border: `border border-gray-300`
- Input focus: `focus:ring-2 focus:ring-primary focus:border-primary`
- Label: `text-sm font-medium text-gray-700`
- Error: `text-sm text-red-600`

### Badges

- AMAN: `--color-accent` (`#059669`) with `--color-on-accent` (`#000000`)
- KRITIS: `--color-orange` (`#F59E0B`) with `--color-on-orange` (`#000000`)
- HABIS: `--color-destructive` (`#DC2626`) with `--color-on-destructive` (`#FFFFFF`)
- TUMPUL: `var(--color-muted-foreground)` (`#475569`)
- PROCESSING: `var(--color-primary)` (`#1E3A5F`)

### Status Colors

| Status | Color Token | Description |
|--------|-------------|-------------|
| AMAN | `--color-accent` | Ready >= Safety Stock |
| KRITIS | `--color-orange` | 0 < Ready < Safety Stock |
| HABIS | `--color-destructive` | Ready = 0 |
| DIPAKAI | `--color-primary` | In use on machine |
| TUMPUL | `--color-muted-foreground` | Waiting regrind |
| SCRAP | `--color-destructive` | Beyond repair |
| KARAT | `--color-orange` | Abnormal condition |

## Interaction States

- **Tap Feedback**: `transition-colors duration-150 hover:bg-accent/90`
- **Pressed**: `active:scale-95 active:opacity-90`
- **Focus**: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2`
- **Disabled**: `opacity-50 pointer-events-none`
- **Reduced Motion**: `transition-none` when `prefers-reduced-motion: reduce`

## Accessibility

- Contrast: 4.5:1 minimum for normal text, 3:1 for large text (AA WCAG)
- Focus visible on all interactive elements
- `aria-label` or `aria-labelledby` on icon-only buttons
- `aria-hidden="true"` on decorative icons
- Form labels always associated with inputs
- Color is not the only indicator (text labels + color)
- Reduced motion support: `prefers-reduced-motion` respected

## Loading States

- **Skeleton**: `animate-pulse bg-gray-100/50` placeholders
- **Spinner**: `h-4 w-4 inline-block mr-2` with `animate-spin`
- **Timeout**: 3-5 seconds before timeout message
- **Retry**: "Coba lagi" button on persistent errors

## Empty States

- Illustrative icon + descriptive text + action button
- Message: "Belum ada [data]."
- Action: "Buat [data]" or "Filter untuk menyaring"

## Responsive Behavior

- **Mobile** (< 640px): Single column, stacked cards, bottom navigation
- **Tablet** (640-1024px): Two-column layouts, condensed tables
- **Desktop** (> 1024px): Fixed/sidebar layout, expansive tables, full KPI bar

## Navigation

- **Desktop**: Fixed sidebar (200px) + top content area
- **Mobile**: Bottom navigation bar (5 items) or hamburger menu
- **Active Link**: `border-b-2 border-primary` under menu item
- **Hover**: `hover:bg-gray-100` on menu items

## Charts & Data Visualization

- **Bullet Chart**: Multiple KPIs side by side
- **Gauge Chart**: Single KPI against target
- **Bar Chart**: Vendor comparison, stock levels
- **Line Chart**: Regrind aging, usage trends
- **Color**: Use RDI palette; color is supplementary to text labels

## Design Rules Anti-Patterns

- ❌ No emojis as structural icons (use SVG: Heroicons/Lucide)
- ❌ Low-contrast gray body text (< 4.5:1)
- ❌ Hardcoded per-screen hex values (use design tokens)
- ❌ Layout-shifting transforms on interaction
- ❌ Tiny tap targets (< 44pt)
- ❌ One theme only (light AND dark supported)
- ❌ Auto-animations without reduced motion respect
- ❌ Color-only state indication (must have text labels)

## Page-Specific Overrides

Pages can create `pages/[page-name].md` files that **override** this Master file. When building a specific page:

1. Check `design-system/rdi-tooling/pages/[page-name].md`
2. If exists, its rules take precedence
3. If not, use Master exclusively

## Hierarchical Retrieval Prompt

```
I am building the [Page Name] page. Please read design-system/rdi-tooling/MASTER.md.
Also check if design-system/rdi-tooling/pages/[page-name].md exists.
If the page file exists, prioritize its rules.
If not, use the Master rules exclusively.
Now, generate the code...
```