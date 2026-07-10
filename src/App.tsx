import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { useTimetable } from './hooks/useTimetable'
import { clearTimetable } from './lib/storage'
import { GuidePage } from './pages/GuidePage'
import { HomePage } from './pages/HomePage'
import { ImportPage } from './pages/ImportPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  const { data, importData, setData } = useTimetable()

  return (
    <HashRouter>
      <div className="app-shell">
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Routes>
            <Route path="/" element={<HomePage data={data} />} />
            <Route path="/import" element={<ImportPage onImport={importData} />} />
            <Route path="/guide" element={<GuidePage />} />
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
        <BottomNav />
      </div>
    </HashRouter>
  )
}
