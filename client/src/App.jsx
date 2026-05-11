import { Routes, Route } from 'react-router-dom';
import AdminPage from '@/pages/AdminPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<AdminPage />} />
    </Routes>
  );
}

export default App;
