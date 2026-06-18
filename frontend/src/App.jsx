import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Hotspots from './pages/Hotspots';
import Analytics from './pages/Analytics';
import ModelScores from './pages/ModelScores';
import AssistantWidget from './components/AssistantWidget';

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/hotspots" element={<Hotspots />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/model" element={<ModelScores />} />
      </Routes>
      <AssistantWidget />
    </BrowserRouter>
  );
}
