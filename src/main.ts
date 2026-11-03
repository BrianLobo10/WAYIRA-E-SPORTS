import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';

// En producción no se imprime información de depuración en la consola del navegador
if (environment.production) {
  const noop = () => undefined;
  console.log = noop;
  console.debug = noop;
  console.info = noop;
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
