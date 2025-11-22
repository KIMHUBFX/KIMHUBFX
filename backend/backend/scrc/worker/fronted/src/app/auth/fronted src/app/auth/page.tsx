'use client';
import { useState } from 'react';
import API from '../lib/api';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login'|'register'>('login');

  const handleSubmit = async () => {
    const url = mode === 'login' ? '/auth/login' : '/auth/register';
    const res = await API.post(url, { email, password });
    localStorage.setItem('token', res.data.token);
    alert('Authenticated');
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl mb-4">{mode === 'login' ? 'Login' : 'Register'}</h1>
      <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" className="mb-2 p-2 border rounded w-full"/>
      <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" className="mb-2 p-2 border rounded w-full"/>
      <button onClick={handleSubmit} className="px-4 py-2 bg-green-600 text-white rounded">Submit</button>
      <p className="mt-2 cursor-pointer text-blue-600" onClick={()=>setMode(mode==='login'?'register':'login')}>Switch to {mode==='login'?'Register':'Login'}</p>
    </div>
  )
}
