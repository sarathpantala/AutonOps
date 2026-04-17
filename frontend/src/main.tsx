import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const savedTheme = window.localStorage.getItem('autonops-theme');
const useDark = savedTheme ? savedTheme === 'dark' : true;
document.documentElement.classList.toggle('dark', useDark);
document.body.classList.toggle('dark', useDark);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
