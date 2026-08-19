import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { BaiduAnalytics } from './components/BaiduAnalytics'
import { BottomNav } from './components/BottomNav'
import { LuciusSupport } from './components/LuciusSupport'
import { TelemetryBoot } from './components/TelemetryBoot'
import { UpdateBanner } from './components/UpdateBanner'
import { useTimetable } from './hooks/useTimetable'
import { clearTimetable } from './lib/storage'
import { AdminPage } from './pages/AdminPage'
import { GuidePage } from './pages/GuidePage'
import { HomePage } from './pages/HomePage'
import { ImportPage } from './pages/ImportPage'
import { SettingsPage } from './pages/SettingsPage'

function Shell() {
  const { data, importData, setData } = useTimetable()
  const { pathname } = useLocation()
  const isAdmin = pathname === '/admin'

  return (
    <>
      {!isAdmin && <TelemetryBoot />}
      <div className="app-shell">
        {!isAdmin && <UpdateBanner />}
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Routes>
            <Route path="/" element={<HomePage data={data} onUpdate={setData} onRestore={importData} />} />
            <Route path="/import" element={<ImportPage onImport={importData} />} />
            <Route path="/guide" element={<GuidePage onImport={importData} />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route
              path="/settings"
              element={
                <SettingsPage
                  data={data}
                  onImport={importData}
                  onClear={() => {
                    clearTimetable()
                    setData(null)
                  }}
                />
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        {!isAdmin && <BottomNav />}
      </div>
      {!isAdmin && <LuciusSupport />}
    </>
  )
}

export default function App() {
  return (
    <HashRouter>
      <BaiduAnalytics />
      <Shell />
    </HashRouter>
  )
}
