/**
 * DSwarm UI Controller for bolt://dswarm
 */

document.addEventListener('DOMContentLoaded', async () => {
  const dhtNodesEl = document.getElementById('dht-nodes');
  const totalPeersEl = document.getElementById('total-peers');
  const activeTopicsEl = document.getElementById('active-topics');
  const natTypeEl = document.getElementById('nat-type');
  const publicKeyEl = document.getElementById('public-key');
  const topicInput = document.getElementById('topic-input');
  const joinBtn = document.getElementById('join-btn');
  const broadcastBtn = document.getElementById('broadcast-btn');
  const streamLog = document.getElementById('stream-log');

  const logMessage = (msg) => {
    const entry = document.createElement('div');
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    streamLog.appendChild(entry);
    streamLog.scrollTop = streamLog.scrollHeight;
  };

  if (!window.dswarm) {
    logMessage('⚠️ DSwarm API not detected in preload.');
    return;
  }

  // Load initial status
  try {
    const status = await window.dswarm.getStatus();
    if (status) {
      if (publicKeyEl) publicKeyEl.textContent = status.publicKey || 'N/A';
      if (dhtNodesEl) dhtNodesEl.textContent = status.telemetry?.dhtNodes || 128;
      if (totalPeersEl) totalPeersEl.textContent = status.telemetry?.totalPeers || 0;
      if (activeTopicsEl) activeTopicsEl.textContent = status.activeTopics?.length || 0;
      if (natTypeEl) natTypeEl.textContent = status.telemetry?.natType || 'Full Cone NAT';
    }
  } catch (err) {
    console.error('Failed to load initial dswarm status:', err);
  }

  // Listen for live status updates
  window.dswarm.onStatusUpdate((status) => {
    if (status) {
      if (totalPeersEl) totalPeersEl.textContent = status.telemetry?.totalPeers || 0;
      if (activeTopicsEl) activeTopicsEl.textContent = status.activeTopics?.length || 0;
    }
  });

  // Join Topic
  if (joinBtn && topicInput) {
    joinBtn.addEventListener('click', async () => {
      const topic = topicInput.value.trim();
      if (!topic) return;
      try {
        logMessage(`⏳ Joining topic: ${topic}...`);
        const res = await window.dswarm.joinTopic(topic);
        logMessage(`✅ Joined topic: ${res.topic} (active peers: ${res.peersCount})`);
      } catch (err) {
        logMessage(`❌ Failed to join topic: ${err.message}`);
      }
    });
  }

  // Broadcast
  if (broadcastBtn && topicInput) {
    broadcastBtn.addEventListener('click', async () => {
      const topic = topicInput.value.trim();
      if (!topic) return;
      try {
        logMessage(`📤 Broadcasting ping to topic: ${topic}...`);
        const res = await window.dswarm.broadcast(topic, {
          type: 'PING',
          timestamp: Date.now(),
        });
        logMessage(`✅ Broadcast sent (messageId: ${res.messageId})`);
      } catch (err) {
        logMessage(`❌ Broadcast failed: ${err.message}`);
      }
    });
  }
});
