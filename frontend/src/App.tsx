import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Policies from './pages/Policies'
import Payments from './pages/Payments'
import AuditTrail from './pages/AuditTrail'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/policies" element={<Policies />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/audit" element={<AuditTrail />} />
      </Route>
    </Routes>
  )
}

export default App
