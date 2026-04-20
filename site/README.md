# Parasocial — landing site

Static single-page site. No build step, no dependencies, no framework.

## Deploy

### Vercel (fastest)

```bash
npm i -g vercel
cd site
vercel --prod
```

Or via UI: [vercel.com/new](https://vercel.com/new) → import the `parasocial-bot`
repo → **Root Directory: `site`** → framework: *Other* → deploy.

### Netlify

Drag-and-drop the `site/` folder into [app.netlify.com/drop](https://app.netlify.com/drop).

### GitHub Pages

Repo → Settings → Pages → Source: Deploy from a branch → `main` · `/site`.
