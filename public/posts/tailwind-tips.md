# 10 Tailwind CSS Tips for Better Styling

Tailwind CSS has revolutionized how we write CSS. Here are 10 practical tips to level up your Tailwind skills.

## 1. Use `@apply` for Repeated Patterns

When you have repeated utility combinations, extract them:

```css
@layer components {
  .btn-primary {
    @apply px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors;
  }
}
```

**But use sparingly!** The beauty of Tailwind is utilities in HTML. Only extract when truly repetitive.

## 2. Leverage Dark Mode with `class` Strategy

```js
// tailwind.config.js
module.exports = {
  darkMode: 'class',  // Toggle via class instead of media query
}
```

Then toggle dark mode programmatically:

```js
document.documentElement.classList.add('dark')
```

## 3. Use Arbitrary Values for One-Offs

Need a specific value not in the default scale?

```html
<div class="w-[73px] top-[117px]">
  <!-- Precise positioning -->
</div>
```

## 4. Master the `prose` Plugin

For markdown or rich text content:

```bash
npm install @tailwindcss/typography
```

```html
<article class="prose dark:prose-invert max-w-none">
  <!-- Beautiful typography automatically applied -->
</article>
```

## 5. Use `space-y` for Vertical Spacing

Instead of adding margins to each child:

```html
<!-- Instead of this: -->
<div>
  <p class="mb-4">First</p>
  <p class="mb-4">Second</p>
  <p>Third</p>
</div>

<!-- Do this: -->
<div class="space-y-4">
  <p>First</p>
  <p>Second</p>
  <p>Third</p>
</div>
```

## 6. Responsive Design is Mobile-First

Tailwind breakpoints work upwards:

```html
<div class="w-full md:w-1/2 lg:w-1/3">
  <!-- Full width mobile, half on tablet, third on desktop -->
</div>
```

- No prefix = all sizes
- `md:` = medium and up
- `lg:` = large and up

## 7. Use `group` for Hover Effects on Parents

```html
<div class="group">
  <img class="group-hover:scale-105 transition-transform" />
  <h3 class="group-hover:text-blue-600">Hover the card!</h3>
</div>
```

## 8. Customize Your Theme Thoughtfully

Extend, don't override:

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9ff',
          // ... your custom colors
        }
      }
    }
  }
}
```

## 9. Use `ring` for Focus States

Better than borders (doesn't affect layout):

```html
<input class="focus:ring-2 focus:ring-blue-500" />
```

## 10. Performance: Purge Unused Styles

Tailwind automatically purges in production, but ensure your config includes all templates:

```js
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
}
```

## Conclusion

Tailwind is powerful when you embrace utility-first thinking. Start with utilities, extract only when needed, and let the framework handle the heavy lifting!
