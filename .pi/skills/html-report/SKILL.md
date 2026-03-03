---
name: html-report
description: Generate styled HTML reports using the Terminal Dashboard theme. Use when the user needs to create an HTML report, dashboard, data visualization, or styled output document. Triggers include requests to "generate a report", "create an HTML file", "make a dashboard", "visualize data", "export to HTML", or any task requiring formatted HTML output with the project's visual identity.
---

# HTML Report Generation

Generate professional HTML reports using the Terminal Dashboard theme — a precision-focused, monochromatic, high-density design supporting both dark and light modes.

## Quick Start

1. **Read the template:** `.pi/skills/html-report/template.html`
2. **Replace placeholders:**
   - `{{TITLE}}` → Report title (appears in browser tab)
   - `{{BODY}}` → Your report content HTML
3. **Write to:** `reports/[report-name].html`

```python
# Example generation pattern
template = read("/.pi/skills/html-report/template.html")
html = template.replace("{{TITLE}}", "LEAP IV Scan | 2026-03-03")
html = html.replace("{{BODY}}", body_content)
write("reports/leap-iv-scan.html", html)
```

## Template Features

The template (`template.html`) includes:

- ✅ Full CSS with dark/light mode support
- ✅ System preference detection (`prefers-color-scheme`)
- ✅ Theme toggle button (just add the button HTML in your body)
- ✅ JetBrains Mono font loaded
- ✅ All component styles pre-defined
- ✅ Print-friendly styles
- ✅ Responsive grid utilities

**You only write the `<body>` content — no `<head>` needed!**

## Body Structure Template

```html
<!-- HEADER (always include) -->
<header class="header">
  <div>
    <h1 class="title">Report Title</h1>
    <p class="subtitle">Optional subtitle or description</p>
  </div>
  <div class="header-actions">
    <span class="timestamp">Generated: 2026-03-03 11:30 PST</span>
    <button class="theme-toggle" onclick="toggleTheme()">◐ THEME</button>
  </div>
</header>

<!-- METRICS (optional) -->
<div class="metrics">
  <div class="metric">
    <div class="metric-label">Label</div>
    <div class="metric-value">Value</div>
    <div class="metric-change">Change note</div>
  </div>
  <!-- more metrics... -->
</div>

<!-- CONTENT PANELS -->
<div class="panel">
  <div class="panel-header">Section Title</div>
  <div class="panel-body">
    Content here
  </div>
</div>

<!-- OR TABLES -->
<div class="panel">
  <div class="panel-header">Data Table</div>
  <table>
    <thead>
      <tr>
        <th>Column</th>
        <th class="text-right">Number</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Value</td>
        <td class="text-right">123.45</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- FOOTER (optional) -->
<div class="footer">
  <p>Footer text · Additional info</p>
</div>
```

## Available CSS Classes

### Layout
| Class | Usage |
|-------|-------|
| `.container` | Auto-applied, max-width 1400px |
| `.header` | Report header with flex layout |
| `.grid-2` | Two-column grid (2fr 1fr) |
| `.grid-3` | Three equal columns |
| `.grid-4` | Four equal columns |
| `.divider` | Horizontal rule with margin |

### Panels & Cards
| Class | Usage |
|-------|-------|
| `.panel` | Container with border |
| `.panel-header` | Section title bar |
| `.panel-body` | Padded content area |
| `.panel-accent` | Highlighted border |
| `.card` | Standalone card |
| `.card-accent` | Highlighted card |

### Metrics
| Class | Usage |
|-------|-------|
| `.metrics` | Auto-fit grid container |
| `.metric` | Single metric block |
| `.metric-label` | Small uppercase label |
| `.metric-value` | Large value display |
| `.metric-value.large` | 32px value |
| `.metric-value.small` | 18px value |
| `.metric-change` | Secondary info with top border |

### Tables
| Class | Usage |
|-------|-------|
| `table` | Full-width, collapsed borders |
| `th` | Sticky header, uppercase |
| `tr:hover` | Row highlight on hover |
| `tr.highlight` | Permanently highlighted row |

### Text
| Class | Usage |
|-------|-------|
| `.text-right` | Right align |
| `.text-center` | Center align |
| `.text-muted` | Secondary color |
| `.text-positive` | Green |
| `.text-negative` | Red |
| `.text-warning` | Orange |
| `.text-small` | 11px |
| `.text-uppercase` | Uppercase + letter-spacing |

### Pills / Badges
| Class | Usage |
|-------|-------|
| `.pill` | Default bordered badge |
| `.pill-accent` | Inverted (white/black) |
| `.pill-positive` | Green background |
| `.pill-negative` | Red background |
| `.pill-warning` | Orange background |

### Status Indicators
```html
<span class="status">
  <span class="status-dot"></span>
  LIVE
</span>

<!-- Variants -->
<span class="status-dot positive"></span>
<span class="status-dot negative"></span>
<span class="status-dot warning"></span>
<span class="status-dot static"></span>  <!-- No animation -->
```

### Buttons
| Class | Usage |
|-------|-------|
| `.btn` | Default button |
| `.btn-accent` | Inverted button |
| `.theme-toggle` | Theme switch button |

### Special Components
```html
<!-- Callout box -->
<div class="callout">
  <div class="callout-title">Note</div>
  <p>Content here</p>
</div>
<div class="callout positive">...</div>
<div class="callout negative">...</div>
<div class="callout warning">...</div>

<!-- Section header -->
<div class="section-header">Section Name</div>

<!-- Progress bar -->
<div class="bar-container">
  <div class="bar-fill" style="width: 75%"></div>
</div>
<div class="bar-container">
  <div class="bar-fill positive" style="width: 60%"></div>
</div>
```

## Color Tokens

Use CSS variables for theme compatibility:

| Token | Usage |
|-------|-------|
| `--bg-base` | Page background |
| `--bg-panel` | Panel background |
| `--bg-hover` | Hover state |
| `--border-dim` | Default borders |
| `--border-focus` | Active borders |
| `--text-primary` | Main text |
| `--text-muted` | Secondary text |
| `--accent-bg` | Inverted bg |
| `--accent-text` | Inverted text |
| `--positive` | Green |
| `--negative` | Red |
| `--warning` | Orange |

## Example: Minimal Report

```html
{{BODY}} content:

<header class="header">
  <div>
    <h1 class="title">Daily Summary</h1>
  </div>
  <div class="header-actions">
    <span class="timestamp">2026-03-03</span>
    <button class="theme-toggle" onclick="toggleTheme()">◐ THEME</button>
  </div>
</header>

<div class="metrics">
  <div class="metric">
    <div class="metric-label">Positions</div>
    <div class="metric-value">12</div>
  </div>
  <div class="metric">
    <div class="metric-label">P&L</div>
    <div class="metric-value text-positive">+$4,500</div>
  </div>
</div>

<div class="panel">
  <div class="panel-header">Open Positions</div>
  <table>
    <thead>
      <tr>
        <th>Ticker</th>
        <th class="text-right">Value</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>AAPL</td>
        <td class="text-right">$15,000</td>
        <td><span class="pill pill-positive">PROFIT</span></td>
      </tr>
    </tbody>
  </table>
</div>
```

## File Naming Convention

```
reports/
├── portfolio-2026-03-03.html
├── leap-iv-scan-2026-03-03.html
├── flow-scan-AAPL.html
└── trade-journal-2026-03.html
```

## Generation Checklist

When creating a report:

1. [ ] Read template from `.pi/skills/html-report/template.html`
2. [ ] Replace `{{TITLE}}` with report title
3. [ ] Create body HTML with header (include theme toggle!)
4. [ ] Replace `{{BODY}}` with your content
5. [ ] Save to `reports/` with descriptive filename
6. [ ] Open in browser to verify
