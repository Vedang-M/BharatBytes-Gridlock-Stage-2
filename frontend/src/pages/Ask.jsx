import { useState } from 'react';
import { postQA } from '../api/backendApi';

export default function Ask() {
  const [location, setLocation] = useState('Jaynagar');
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('11:00');
  const [resp, setResp] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const data = await postQA({ location, start_time: start, end_time: end });
    setResp(data);
  };

  const speak = (text) => {
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  return (
    <div className="page">
      <h2>Ask ParkIQ</h2>
      <form onSubmit={submit}>
        <label>Location</label>
        <input value={location} onChange={e => setLocation(e.target.value)} />
        <label>Start time</label>
        <input value={start} onChange={e => setStart(e.target.value)} />
        <label>End time</label>
        <input value={end} onChange={e => setEnd(e.target.value)} />
        <button type="submit">Ask</button>
      </form>

      {resp && (
        <div className="qa-result">
          <h3>Result</h3>
          <pre>{JSON.stringify(resp, null, 2)}</pre>
          {resp.sarvam_text && (
            <button onClick={() => speak(resp.sarvam_text)}>Play Explanation</button>
          )}
        </div>
      )}
    </div>
  );
}
