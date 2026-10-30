import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './styles/tokens.css';
import './styles/app.css';
import './styles/landing.css';
import { I18nProvider } from './i18n/I18nProvider';
import { AppShell }from './components/AppShell';
import { Home } from './pages/Home';
import { Placeholder } from './pages/Placeholder';
import { Menu } from './pages/Menu';
import { Learn } from './pages/Learn';
import { Article } from './pages/Article';
import { Clinics } from './pages/Clinics';
import { ClinicProfile } from './pages/ClinicProfile';
import { Pathway } from './pages/Pathway';
import { CareIndex, CarePreparing, CareResults, CareTreatment } from './pages/Care';
import { BookingRequest } from './pages/BookingRequest';
import { AppointmentLookup } from './pages/AppointmentLookup';
import { StaffArea } from './staff/StaffSession';
import { StaffGuard } from './staff/StaffFrame';
import { StaffLogin } from './staff/StaffLogin';
import { StaffQueue } from './staff/StaffQueue';
import { StaffRequestDetail } from './staff/StaffRequestDetail';
import { AdminArea } from './admin/AdminSession';
import { AdminGuard } from './admin/AdminGuard';
import { AdminLogin } from './pages/admin/AdminLogin';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminClinics } from './pages/admin/AdminClinics';
import { AdminContent } from './pages/admin/AdminContent';
import { AdminStaff } from './pages/admin/AdminStaff';
import { AdminMinorSop } from './pages/admin/AdminMinorSop';
import { AdminReports } from './pages/admin/AdminReports';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="learn" element={<Learn />} />
        <Route path="learn/:slug" element={<Article />} />
        <Route path="clinics" element={<Clinics />} />
        <Route path="clinics/:id" element={<ClinicProfile />} />
        <Route path="clinics/:id/request" element={<BookingRequest />} />
        <Route path="appointments/lookup" element={<AppointmentLookup />} />
        <Route path="pathway" element={<Pathway />} />
        <Route path="care" element={<CareIndex />} />
        <Route path="care/results" element={<CareResults />} />
        <Route path="care/treatment-and-referral" element={<CareTreatment />} />
        <Route path="care/preparing-for-your-visit" element={<CarePreparing />} />
        <Route path="menu" element={<Menu />} />
        <Route path="staff" element={<StaffArea />}>
          <Route path="login" element={<StaffLogin />} />
          <Route element={<StaffGuard />}>
            <Route index element={<Navigate to="/staff/requests" replace />} />
            <Route path="requests" element={<StaffQueue />} />
            <Route path="requests/:id" element={<StaffRequestDetail />} />
          </Route>
        </Route>
        <Route path="admin" element={<AdminArea />}>
          <Route path="login" element={<AdminLogin />} />
          <Route element={<AdminGuard />}>
            <Route index element={<AdminDashboard />} />
            <Route path="clinics" element={<AdminClinics />} />
            <Route path="content" element={<AdminContent />} />
            <Route path="staff" element={<AdminStaff />} />
            <Route path="minor-sop" element={<AdminMinorSop />} />
            <Route path="reports" element={<AdminReports />} />
          </Route>
        </Route>
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
