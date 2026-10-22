// Entry point: route table and bottom navigation.
//
// Module boundaries (see docs/architecture.md):
//   js/core/   router, data loading, search, sharing — shared by everything
//   js/mol/    molecule viewers (3D/2D), RDKit loader — M1–M3
//   js/views/  one file per screen
//   js/periodic/  periodic table, electron configuration, bonds — M4
//                 (uses only js/core/, never js/mol/)
import { route, startRouter } from './core/router.js';
import { hydrateIcons } from './core/icons.js';
import { renderHome } from './views/home.js';
import { renderLibrary } from './views/library.js';
import { renderCompound, renderView } from './views/compound.js';
import { renderScan } from './views/scan.js';
import { renderCompare } from './views/compare.js';
import { renderQuiz } from './views/quiz.js';
import { renderSeries } from './views/series.js';
import { renderBuild } from './views/build.js';
import { renderMore } from './views/more.js';
import { renderPeriodic } from './periodic/table.js';
import { renderElement } from './periodic/detail.js';
import { renderElectron, renderElectronHome } from './periodic/electron.js';
import { renderBond } from './periodic/bond.js';
import { notFound } from './views/placeholder.js';

route('/', renderHome, { tab: 'home' });
route('/library', renderLibrary, { tab: 'library', title: '分子をさがす' });
route('/compound/:id', renderCompound, { tab: 'library', title: '分子' });
route('/view', renderView, { tab: 'library', title: '共有された分子' });
route('/scan', renderScan, { tab: 'home', title: 'QRコードを読み取る' });
route('/more', renderMore, { tab: 'more', title: 'その他' });

// --- M2: compare (A-13 – A-16)
route('/compare', renderCompare, { tab: 'home', title: 'くらべる' });
route('/compare/:preset', renderCompare, { tab: 'home', title: 'くらべる' });
// --- M2: functional-group quiz (A-17)
route('/quiz', renderQuiz, { tab: 'more', title: '官能基クイズ' });
// --- M2: homologous series (B-3)
route('/series', renderSeries, { tab: 'more', title: '同族体シリーズ' });
// --- M3: molecule builder (C)
route('/build', renderBuild, { tab: 'build', title: 'つくる' });
// --- M4: periodic table (F), electron configuration (E), bonds (E-6)
route('/periodic', renderPeriodic, { tab: 'periodic', title: '周期表' });
route('/periodic/:sym', renderElement, { tab: 'periodic', title: '元素' });
route('/electron', renderElectronHome, { tab: 'periodic', title: '電子配置' });
route('/electron/:sym', renderElectron, { tab: 'periodic', title: '電子配置' });
route('/bond', renderBond, { tab: 'periodic', title: '電子と結合' });

route('/404', notFound, {});

hydrateIcons(document.querySelector('.nav'));
const tabs = [...document.querySelectorAll('.nav a')];
startRouter(document.getElementById('app'), {
  onRouteChange({ tab }) {
    tabs.forEach((a) => {
      if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  },
});
