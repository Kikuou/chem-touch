// Entry point: route table and bottom navigation.
//
// Module boundaries (see docs/architecture.md):
//   js/core/   router, data loading, search, sharing — shared by everything
//   js/mol/    molecule viewers (3D/2D), RDKit loader — M1–M3
//   js/views/  one file per screen
// Later milestones add their screens here: M2 compare, M3 build,
// M4 periodic table / electron configuration.
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
import { placeholder, notFound } from './views/placeholder.js';

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
// --- M4: periodic table (F) and electron configuration (E)
route('/periodic', placeholder({
  title: '周期表', milestone: 'M4',
  text: '元素の詳細、原子半径や電気陰性度の傾向、栄養ミネラルを表示する周期表です。',
}), { tab: 'periodic', title: '周期表' });
route('/electron', placeholder({
  title: '電子配置', milestone: 'M4',
  text: 'K・L・M・N殻に電子を置いて電子配置を学ぶ機能です。',
}), { tab: 'home', title: '電子配置' });

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
