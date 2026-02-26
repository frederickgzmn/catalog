import React, { useState } from 'react';
import { gql, useSubscription } from '@apollo/client';
import './App.css';

// GraphQL subscription
const POST_UPDATED_SUBSCRIPTION = gql`
  subscription PostUpdated($id: ID!) {
    postUpdated(id: $id) {
      id
      title
      content
      modified
      author {
        node {
          name
        }
      }
    }
  }
`;

// Connection status component
function ConnectionStatus({ loading, error, data }: { loading: boolean; error: any; data: any }) {
  if (loading) return <div className="status connecting">🔄 Connecting to SSE-2...</div>;
  if (error) return <div className="status error">❌ Error: {error.message}</div>;
  if (data) return <div className="status connected">✅ Connected - Receiving real-time updates</div>;
  return <div className="status disconnected">⭕ Ready to connect</div>;
}

// Subscription data display component
function SubscriptionData({ data }: { data: any }) {
  if (!data?.postUpdated) {
    return (
      <div className="subscription-data">
        <h3>📡 Latest Subscription Data</h3>
        <div className="no-data">
          No data received yet. Start a subscription to see real-time updates here.
        </div>
      </div>
    );
  }

  const post = data.postUpdated;
  
  return (
    <div className="subscription-data">
      <h3>📡 Latest Subscription Data</h3>
      <div className="post-data">
        <div className="post-header">
          <h4>{post.title}</h4>
          <div className="post-meta">
            <span>ID: {post.id}</span>
            <span>Modified: {new Date(post.modified).toLocaleString()}</span>
            {post.author?.node?.name && <span>Author: {post.author.node.name}</span>}
          </div>
        </div>
        <div className="post-content">
          {post.content && (
            <div dangerouslySetInnerHTML={{ __html: post.content.substring(0, 500) + '...' }} />
          )}
        </div>
      </div>
      
      <details className="raw-data">
        <summary>Raw JSON Data</summary>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>
  );
}

// Statistics component
function Stats({ startTime, eventCount }: { startTime: number | null; eventCount: number }) {
  const [elapsed, setElapsed] = useState(0);

  React.useEffect(() => {
    if (!startTime) return;
    
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="stats">
      <div className="stat-card">
        <div className="stat-value">{eventCount}</div>
        <div className="stat-label">Events Received</div>
      </div>
      <div className="stat-card">
        <div className="stat-value">{startTime ? formatTime(elapsed) : '--'}</div>
        <div className="stat-label">Connected For</div>
      </div>
    </div>
  );
}

// Main App component
function App() {
  const [postId, setPostId] = useState('147');
  const [isActive, setIsActive] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [allEvents, setAllEvents] = useState<any[]>([]);

  // Use Apollo's useSubscription hook
  const { data, loading, error } = useSubscription(POST_UPDATED_SUBSCRIPTION, {
    variables: { id: postId },
    skip: !isActive,
    onSubscriptionData: ({ subscriptionData }) => {
      console.log('Received subscription data:', subscriptionData);
      
      if (subscriptionData.data) {
        setEventCount(prev => prev + 1);
        setAllEvents(prev => [...prev, {
          timestamp: new Date().toISOString(),
          data: subscriptionData.data
        }]);
      }
    },
    onSubscriptionComplete: () => {
      console.log('Subscription completed');
      setIsActive(false);
      setStartTime(null);
    },
  });

  const handleStart = () => {
    setIsActive(true);
    setStartTime(Date.now());
    setEventCount(0);
    setAllEvents([]);
  };

  const handleStop = () => {
    setIsActive(false);
    setStartTime(null);
  };

  const handleClear = () => {
    setAllEvents([]);
    setEventCount(0);
  };

  return (
    <div className="app">
      <div className="container">
        <h1>🚀 Apollo Client + SSE-2 Integration Demo</h1>
        <p>
          This demo shows Apollo Client working with our SSE-2 GraphQL subscription sidecar 
          using Server-Sent Events. It uses the real Apollo Client <code>useSubscription</code> hook!
        </p>

        <ConnectionStatus loading={loading && isActive} error={error} data={data} />

        <div className="config-section">
          <div className="config-item">
            <label htmlFor="post-id">Post ID to Subscribe:</label>
            <input
              type="text"
              id="post-id"
              value={postId}
              onChange={(e) => setPostId(e.target.value)}
              disabled={isActive}
            />
          </div>
        </div>

        <div className="controls">
          <button 
            className="primary" 
            onClick={handleStart} 
            disabled={isActive}
          >
            {loading && isActive ? 'Connecting...' : 'Start Subscription'}
          </button>
          <button 
            className="danger" 
            onClick={handleStop} 
            disabled={!isActive}
          >
            Stop Subscription
          </button>
          <button 
            className="success" 
            onClick={handleClear}
          >
            Clear Events
          </button>
        </div>

        <Stats startTime={startTime} eventCount={eventCount} />
      </div>

      <SubscriptionData data={data} />

      <div className="container">
        <h3>📊 Event History</h3>
        <div className="event-history">
          {allEvents.length === 0 ? (
            <div className="no-events">No events received yet. Start a subscription to see events here.</div>
          ) : (
            allEvents.map((event, index) => (
              <div key={index} className="event-item">
                <div className="event-timestamp">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </div>
                <div className="event-data">
                  <strong>Post Updated:</strong> {event.data.postUpdated?.title}
                  <br />
                  <small>ID: {event.data.postUpdated?.id}</small>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="container">
        <h3>🔧 How It Works</h3>
        <div className="how-it-works">
          <div className="step">
            <h4>1. Apollo Client Setup</h4>
            <p>Uses <code>split</code> function to route subscriptions to SSE-2 and queries to WPGraphQL</p>
          </div>
          <div className="step">
            <h4>2. Custom SSE Link</h4>
            <p>Our <code>GraphQLSSELink</code> handles Server-Sent Events as Apollo subscriptions</p>
          </div>
          <div className="step">
            <h4>3. React Integration</h4>
            <p>Standard <code>useSubscription</code> hook works exactly like WebSocket subscriptions</p>
          </div>
          <div className="step">
            <h4>4. Real-time Updates</h4>
            <p>Edit post {postId} in WordPress to see live updates appear here!</p>
          </div>
        </div>
      </div>

      <div className="container">
        <h3>📋 Subscription Query</h3>
        <pre className="query-display">
{`subscription PostUpdated($id: ID!) {
  postUpdated(id: $id) {
    id
    title
    content
    modified
    author {
      node {
        name
      }
    }
  }
}`}
        </pre>
      </div>
    </div>
  );
}

export default App;
