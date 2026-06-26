import { Application, Graphics } from 'pixi.js';

const app = new Application();

await app.init({
  background: '#1a1a2e',
  resizeTo: window,
  antialias: true,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
});

document.body.appendChild(app.canvas);

const g = new Graphics();
g.circle(0, 0, 5);
g.fill({ color: '#00ff88' });
g.x = app.screen.width / 2;
g.y = app.screen.height / 2;
app.stage.addChild(g);

app.ticker.maxFPS = 60;
app.ticker.add(() => {
  g.rotation += 0.01;
});
