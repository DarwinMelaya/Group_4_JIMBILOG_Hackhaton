import { BrowserRouter, Route, Routes } from 'react-router-dom';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './styles/tokens.css';
import './styles/app.css';
import { I18nProvider } from './i18n/I18nProvider';
import { AppShell }from './components/AppShell';
import { Home } from './pages/Home';
import { Placeholder } from './pages/Placeholder';
import { Menu } from './pages/Menu';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="learn" element={<Placeholder titleId="placeholder.learn" />} />
        <Route path="clinics" element={<Placeholder titleId="placeholder.clinics" />} />
        <Route path="menu" element={<Menu />} />
        <Route path="*" element={<Placeholder titleId="notFound.title" />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <I18nProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </I18nProvider>
  );
}
