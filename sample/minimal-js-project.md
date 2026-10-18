# Building a Minimal Modern JavaScript Project

Welcome to CIS 195. In this lecture, we explore how to build a lean, production-ready frontend JavaScript application from scratch using **vanilla JavaScript**, **Vite**, and minimal tooling—without the weight of monolithic frameworks like React or Angular.

Before diving in, make sure you have reviewed the [Course Syllabus](../syllabus.md) and completed the [Environment Setup Guide](../module-00/setup.md). If you run into issues, refer to the [Lab 1 Exercise](lab-01-setup.md) or consult the [Vite Official Guide](https://vite.dev/guide/).

---

## 1. Tooling Comparison

Modern web development often drowns in configuration. By choosing lightweight, purpose-built tools, we can achieve sub-second build times while keeping our codebase clean and maintainable.

| Tool           | Role                 | Dev Server Latency     | Production Bundle Overhead        |
| :------------- | :------------------- | :--------------------- | :-------------------------------- |
| **Vanilla JS** | Core UI & Logic      | 0 ms                   | 0 KB (Native Browser APIs)        |
| **Vite**       | Dev Server & Bundler | $< 50\text{ms}$        | ~15 KB (Development runtime only) |
| **ESLint**     | Code Quality         | N/A (Build time)       | 0 KB (Static analysis)            |
| **Prettier**   | Code Formatting      | N/A (Build time)       | 0 KB (Static analysis)            |
| **Vitest**     | Unit Testing         | $\approx 100\text{ms}$ | 0 KB (Test runner)                |

: Development Tooling Characteristics and Overhead

> **Design Principle**: Modern evergreen browsers natively support ES modules (`import`/`export`), native Web Components, and CSS custom properties. We only need a bundler for local development Ergonomics (Hot Module Replacement) and production optimization (minification and asset hashing).

---

## 2. Theoretical Background: Bundler Performance

Traditional bundlers (like Webpack 4) crawled and bundled your entire application dependency graph before starting the development server:

$$T_{\text{start}} = \mathcal{O}(N)$$

Where $N$ represents the total number of modules in the project.

In contrast, Vite leverages browser-native ES Modules (ESM). It serves source files over native HTTP requests on demand, transforming modules only when the browser asks for them:

$$T_{\text{start}} = \mathcal{O}(1)$$

Hot Module Replacement (HMR) latency remains constant regardless of application size: $T_{\text{HMR}} \le 50\text{ms}$.

---

## 3. Step-by-Step Project Setup

Follow along in your terminal to initialize a clean project workspace.

### Step 3.1: Initialize the Package

First, create a dedicated folder and generate a clean `package.json` file:

```bash
mkdir vanilla-vite-starter
cd vanilla-vite-starter
npm init -y
```

Now, configure your package to use ECMAScript modules by adding `"type": "module"` to `package.json`:

```json
{
    "name": "vanilla-vite-starter",
    "version": "1.0.0",
    "type": "module",
    "scripts": {
        "dev": "vite",
        "build": "vite build",
        "preview": "vite preview"
    }
}
```

### Step 3.2: Install Vite

Install Vite as a development dependency:

```bash
npm install --save-dev vite
```

### Step 3.3: Create the HTML Entry Point

Unlike traditional bundlers where JavaScript is the entry point, Vite treats `index.html` as the source-code root:

```html
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Vanilla JS Starter</title>
        <link rel="stylesheet" href="/src/style.css" />
    </head>
    <body>
        <div id="app"></div>
        <script type="module" src="/src/main.js"></script>
    </body>
</html>
```

### Step 3.4: Write the Application Logic

Create `src/counter.js` to demonstrate reusable stateful component logic:

```javascript
/**
 * Attaches an interactive counter to a target DOM button element.
 * @param {HTMLButtonElement} element
 */
export function setupCounter(element) {
    let counter = 0;

    const updateDisplay = () => {
        element.innerHTML = `Clicks: <strong>${counter}</strong>`;
    };

    element.addEventListener('click', () => {
        counter += 1;
        updateDisplay();
    });

    updateDisplay();
}
```

Now create `src/main.js` to mount your component:

```javascript
import './style.css';
import { setupCounter } from './counter.js';

const app = document.querySelector('#app');

if (app) {
    app.innerHTML = `
    <main class="container">
      <h1>Minimal Vanilla JS + Vite</h1>
      <p>Blazing fast development with zero framework overhead.</p>
      <button id="counter-btn" type="button" class="btn"></button>
    </main>
  `;

    const btn = document.querySelector('#counter-btn');
    if (btn instanceof HTMLButtonElement) {
        setupCounter(btn);
    }
}
```

And style it with modern CSS in `src/style.css`:

```css
:root {
    --primary-color: #0969da;
    --bg-color: #f6f8fa;
    --text-color: #24292f;
}

body {
    margin: 0;
    font-family:
        system-ui,
        -apple-system,
        sans-serif;
    background-color: var(--bg-color);
    color: var(--text-color);
    display: grid;
    place-items: center;
    min-height: 100vh;
}

.container {
    background: #ffffff;
    padding: 2.5rem;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    text-align: center;
}

.btn {
    background-color: var(--primary-color);
    color: #ffffff;
    border: none;
    border-radius: 6px;
    padding: 0.6rem 1.2rem;
    font-size: 1rem;
    cursor: pointer;
    transition: opacity 0.2s ease;
}

.btn:hover {
    opacity: 0.9;
}
```

---

## 4. Verification Checklist

Before moving to the exercises, verify that your project fulfills all foundational requirements:

- [x] Node.js 18+ is installed on your development workstation
- [x] `package.json` specifies `"type": "module"`
- [x] `index.html` references the script via `<script type="module">`
- [ ] Development server starts cleanly via `npm run dev`
- [ ] Hot module replacement reflects changes in browser without full reload
- [ ] Production build succeeds with `npm run build`

---

## 5. Summary and Next Steps

By learning to build with raw browser primitives and lightweight dev tooling, you develop a deep intuition for DOM manipulation, module resolution, and browser rendering lifecycles without framework abstractions getting in the way.

- Continue to the next reading: [Module 2: State Management & DOM Events](../module-02/dom-events.md)
- Complete your hands-on practice: [Lab 1: Vanilla Components](lab-01-setup.md)
- Review internal notes: [Jump back to Tooling Comparison](#1-tooling-comparison)
