import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
            backgroundColor: '#050505',
            color: '#00ff00',
            padding: '40px',
            fontFamily: "'VT323', monospace",
            minHeight: '100vh',
            overflow: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            <div style={{
              maxWidth: '900px',
              width: '100%',
              border: '2px solid #00ff00',
              padding: '30px',
              backgroundColor: '#0a0a0a',
              boxShadow: '0 0 20px rgba(0, 255, 0, 0.3)'
            }}>
              <h1 style={{
                fontSize: '48px',
                marginBottom: '20px',
                textAlign: 'center',
                letterSpacing: '0.2em',
                textShadow: '0 0 10px rgba(0, 255, 0, 0.8)',
                borderBottom: '2px solid #00ff00',
                paddingBottom: '15px'
              }}>
                ⚠ SYSTEM FAILURE ⚠
              </h1>

              <div style={{ marginBottom: '25px', marginTop: '25px' }}>
                <h2 style={{
                  fontSize: '24px',
                  marginBottom: '12px',
                  letterSpacing: '0.1em',
                  color: '#00cc00'
                }}>
                  &gt; ERROR DETECTED:
                </h2>
                  <pre style={{
                    backgroundColor: '#000',
                    border: '1px solid #003300',
                    padding: '15px',
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    fontSize: '18px',
                    color: '#00ff00',
                    lineHeight: '1.5'
                  }}>
                  {this.state.error?.toString()}
                  </pre>
                </div>

              {this.state.errorInfo && (
                <div>
                  <h2 style={{
                    fontSize: '24px',
                    marginBottom: '12px',
                    letterSpacing: '0.1em',
                    color: '#00cc00'
                  }}>
                    &gt; STACK TRACE:
                  </h2>
                  <pre style={{
                    backgroundColor: '#000',
                    border: '1px solid #003300',
                    padding: '15px',
                    overflow: 'auto',
                    fontSize: '14px',
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    color: '#00cc00',
                    lineHeight: '1.4',
                    maxHeight: '400px'
                  }}>
                    {this.state.errorInfo.componentStack}
                  </pre>
                </div>
              )}

              <div style={{
                marginTop: '30px',
                textAlign: 'center',
                fontSize: '16px',
                color: '#006600',
                borderTop: '1px solid #003300',
                paddingTop: '15px'
              }}>
                PRESS F12 FOR DEVELOPER CONSOLE • CHECK BROWSER CONSOLE FOR MORE DETAILS
              </div>
              
              <div style={{ textAlign: 'center', marginTop: '20px' }}>
                <button 
                    onClick={() => window.location.reload()} 
                    style={{
                        border: '2px solid #00ff00',
                        background: 'transparent',
                        color: '#00ff00',
                        padding: '10px 20px',
                        fontFamily: 'inherit',
                        fontSize: '18px',
                        cursor: 'pointer',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em'
                    }}
                >
                    Hard Reboot
                </button>
              </div>
            </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;