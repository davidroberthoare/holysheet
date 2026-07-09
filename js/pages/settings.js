import { APP_VERSION } from '../version.js';
import { isCachingEnabled, enableCaching, disableCaching } from '../caching.js';
import { exportLibrary, downloadExport, importLibrary } from '../export/backup.js';
import { setActiveTab } from '../util.js';

export const settingsRoute = {
  path: '/settings/',
  name: 'settings',
  content: `
    <div class="page" data-name="settings">
      <div class="navbar">
        <div class="navbar-bg"></div>
        <div class="navbar-inner"><div class="title">Settings</div></div>
      </div>
      <div class="page-content">
        <div class="block-title">Offline caching</div>
        <div class="list">
          <ul>
            <li>
              <div class="item-content">
                <div class="item-inner">
                  <div class="item-title">Enable offline caching</div>
                  <div class="item-after">
                    <label class="toggle">
                      <input type="checkbox" id="caching-toggle" />
                      <span class="toggle-icon"></span>
                    </label>
                  </div>
                </div>
              </div>
            </li>
          </ul>
        </div>
        <div class="block block-strong-ios block-strong-md">
          <p>Off is best while building/testing &mdash; every reload gets fresh files, no service worker involved. Turn on to verify the app still works offline (reload once, then try airplane mode), then turn back off to keep developing without stale-cache surprises.</p>
        </div>

        <div class="block-title">Backup</div>
        <div class="list">
          <ul>
            <li>
              <a href="#" class="item-link item-content" id="export-btn">
                <div class="item-inner"><div class="item-title">Export library (.zip)</div></div>
              </a>
            </li>
            <li>
              <a href="#" class="item-link item-content" id="import-btn">
                <div class="item-inner"><div class="item-title">Import from backup</div></div>
              </a>
            </li>
          </ul>
        </div>
        <div class="block block-strong-ios block-strong-md">
          <p>The exported .zip is the only backup of your library &mdash; IndexedDB storage is otherwise the sole copy.</p>
        </div>

        <div class="block-title">About</div>
        <div class="block block-strong-ios block-strong-md">
          <p>HolySheet v${APP_VERSION}</p>
        </div>
      </div>
    </div>
  `,
  on: {
    pageInit(event, page) {
      const { app } = page;
      setActiveTab('settings');
      const toggle = page.el.querySelector('#caching-toggle');
      toggle.checked = isCachingEnabled();

      toggle.addEventListener('change', async () => {
        if (toggle.checked) {
          await enableCaching();
          app.dialog.confirm('Offline caching is on. Reload now to activate it?', 'Reload Required', () => {
            window.location.reload();
          });
        } else {
          await disableCaching();
          app.toast.create({ text: 'Offline caching disabled.', closeTimeout: 2000 }).open();
        }
      });

      page.el.querySelector('#export-btn').addEventListener('click', async (e) => {
        e.preventDefault();
        app.preloader.show();
        try {
          const blob = await exportLibrary();
          downloadExport(blob);
        } catch (err) {
          app.dialog.alert(err.message, 'Export Failed');
        } finally {
          app.preloader.hide();
        }
      });

      page.el.querySelector('#import-btn').addEventListener('click', (e) => {
        e.preventDefault();
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.zip,application/zip';
        input.addEventListener('change', async () => {
          const file = input.files[0];
          if (!file) return;
          app.preloader.show();
          try {
            const result = await importLibrary(file);
            app.dialog.alert(`Imported ${result.sheets} sheet(s), ${result.playlists} playlist(s).`, 'Import Complete');
          } catch (err) {
            app.dialog.alert(err.message, 'Import Failed');
          } finally {
            app.preloader.hide();
          }
        });
        input.click();
      });
    },
  },
};
