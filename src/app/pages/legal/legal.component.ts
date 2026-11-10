import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Privacidad y condiciones de uso (requisito para la clave de producción de la API de Riot). */
@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="legal">
      <p class="legal__kicker">Legal</p>
      <h1 class="legal__title">Privacidad y condiciones de uso</h1>
      <p class="legal__updated">Última actualización: 3 de noviembre de 2026</p>

      <nav class="legal__toc" aria-label="Contenido">
        <a href="#privacidad">Privacidad</a> · <a href="#riot">Datos de Riot Games</a> · <a href="#condiciones">Condiciones de uso</a> · <a href="#contacto">Contacto</a>
      </nav>

      <section id="privacidad">
        <h2>1. Qué datos usamos</h2>
        <ul>
          <li><strong>Cuenta:</strong> al entrar con Google o Discord recibimos tu nombre visible, tu foto de perfil y tu correo. El correo nunca se muestra públicamente; solo el dueño de la plataforma puede consultarlo con un motivo, y cada consulta queda registrada.</li>
          <li><strong>Perfil:</strong> lo que tú escribas (biografía, portada) y, si lo vinculas, tu Riot ID (nombre y etiqueta) y región.</li>
          <li><strong>Comunidad:</strong> publicaciones, comentarios, reacciones, mensajes privados e inscripciones a torneos y sorteos.</li>
          <li><strong>Formulario de contacto:</strong> nombre, correo y mensaje, solo para responderte.</li>
        </ul>
        <p>No vendemos ni compartimos tus datos con terceros con fines publicitarios. No usamos cookies de publicidad ni rastreadores. Los datos se guardan en Supabase (base de datos con acceso restringido por reglas de seguridad) y la web se sirve desde Firebase Hosting.</p>
        <p><strong>Tus derechos:</strong> puedes pedir ver, corregir o borrar tus datos y tu cuenta escribiendo a <a href="mailto:wayirasports@gmail.com">wayirasports&#64;gmail.com</a>. Respondemos en un máximo de 15 días hábiles, conforme a la Ley 1581 de 2012 de protección de datos de Colombia.</p>
      </section>

      <section id="riot">
        <h2>2. Datos de Riot Games</h2>
        <p>La búsqueda de jugadores muestra información pública de League of Legends obtenida de la API oficial de Riot Games: Riot ID, nivel, clasificatorias, maestría de campeones e historial de partidas.</p>
        <ul>
          <li>Solo consultamos datos cuando alguien busca un jugador o abre un perfil con Riot ID vinculado.</li>
          <li>Las respuestas se guardan unos minutos en memoria para no saturar la API, y luego se descartan. No construimos bases de datos de jugadores.</li>
          <li>La clave de la API se usa solo en nuestro servidor; nunca se envía al navegador.</li>
          <li>No vendemos ni comercializamos datos de Riot Games, y el acceso a la búsqueda es gratuito.</li>
        </ul>
      </section>

      <section id="condiciones">
        <h2>3. Condiciones de uso</h2>
        <ul>
          <li>Debes tratar con respeto a los demás. Podemos retirar contenido ofensivo, spam o trampas y suspender cuentas que incumplan estas normas; cada acción de moderación queda registrada.</li>
          <li>Eres responsable de lo que publicas. No subas contenido que no te pertenezca o que infrinja derechos de terceros.</li>
          <li>Los sorteos se realizan en el servidor con un procedimiento aleatorio verificable; las bases de cada sorteo se publican en su página.</li>
          <li>La plataforma se ofrece tal cual; podemos cambiar o pausar funciones para mejorarla.</li>
        </ul>
      </section>

      <section id="contacto">
        <h2>4. Contacto</h2>
        <p>WAYIRA E-SPORTS S.A.S. · La Guajira, Colombia · <a href="mailto:wayirasports@gmail.com">wayirasports&#64;gmail.com</a> · <a routerLink="/contact">Formulario de contacto</a></p>
      </section>

      <p class="legal__riot">
        WAYIRA E-SPORTS isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
      </p>
    </article>
  `,
  styles: [`
    :host { display: block; background: var(--bg); color: var(--white); }
    .legal { max-width: var(--reading, 760px); margin: 0 auto; padding: clamp(48px, 8vh, 96px) var(--gutter) 80px; font-size: 16px; line-height: 1.7; }
    .legal__kicker { margin: 0; font-family: var(--font-mono); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--text-secondary); }
    .legal__title { margin: 8px 0 6px; font-family: var(--font-display); font-weight: 400; font-size: clamp(2rem, 5vw, 3rem); line-height: 1.05; }
    .legal__updated { margin: 0 0 24px; font-size: 13px; color: var(--text-muted); }
    .legal__toc { margin-bottom: 32px; font-size: 14px; color: var(--text-muted); }
    .legal a { color: var(--volt); }
    .legal h2 { margin: 40px 0 12px; font-size: 20px; font-weight: 600; }
    .legal p, .legal li { color: var(--text-secondary); }
    .legal strong { color: var(--white); font-weight: 600; }
    .legal p { margin: 12px 0; }
    .legal ul { margin: 12px 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; }
    section { scroll-margin-top: calc(var(--header-h) + 16px); }
    .legal__riot { margin-top: 48px; padding-top: 20px; border-top: 1px solid var(--border); font-size: 13px; color: var(--text-muted) !important; }
  `],
})
export class LegalComponent {}
