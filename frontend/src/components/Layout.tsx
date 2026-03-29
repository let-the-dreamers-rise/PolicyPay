import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Layout() {
  return (
    <div className="app-shell">
      <div className="app-background" />
      <Sidebar />
      <div className="app-main">
        <TopBar />
        <main className="page-frame">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
