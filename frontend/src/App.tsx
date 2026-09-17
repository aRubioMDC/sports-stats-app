import { Route, Routes } from 'react-router-dom'
import { Home } from './pages/Home'
import { GameDetail } from './pages/GameDetail'
import { Cheatsheet } from './pages/Cheatsheet'

function App() {
  return (
    <div className="min-h-screen bg-[#0b0d12]">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/games/:gameId" element={<GameDetail />} />
        <Route path="/cheatsheet" element={<Cheatsheet />} />
      </Routes>
    </div>
  )
}

export default App
