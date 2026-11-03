import { Component } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

class Boundary extends Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return <div className="center" style={{ height: '70vh', textAlign: 'center' }}><h2>Something went wrong</h2>
      <p className="muted">Please reload the page. If it keeps happening, contact support.</p><button onClick={() => location.reload()}>Reload</button></div>;
  }
}
createRoot(document.getElementById('root')).render(<Boundary><App /></Boundary>);
