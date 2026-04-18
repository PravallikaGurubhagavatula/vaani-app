/* Vaani — navigation.css v1.0 */

#vaani-back-btn {
  position: fixed;
  top: 14px;
  left: 14px;
  z-index: 9990;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: rgba(28, 28, 38, 0.88);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  color: #e8e8f0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  box-shadow: 0 2px 16px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,255,255,0.06);
  opacity: 0;
  pointer-events: none;
  transform: translateX(-10px) scale(0.85);
  transition: opacity 0.22s cubic-bezier(0.33,1,0.68,1),
              transform 0.22s cubic-bezier(0.33,1,0.68,1),
              background 0.15s ease;
}
#vaani-back-btn.vn-visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(0) scale(1);
}
#vaani-back-btn:hover {
  background: rgba(100,120,240,0.85);
  box-shadow: 0 4px 20px rgba(100,120,240,0.4), 0 0 0 1px rgba(255,255,255,0.1);
  transform: translateX(-1px) scale(1.06);
}
#vaani-back-btn:active {
  transform: translateX(0) scale(0.94);
  transition-duration: 0.08s;
}
#vaani-back-btn svg { width: 20px; height: 20px; display: block; }

/* Light theme */
body[data-theme="light"] #vaani-back-btn,
body.theme-light #vaani-back-btn {
  background: rgba(255,255,255,0.9);
  color: #1a1a2e;
  box-shadow: 0 2px 14px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06);
}
body[data-theme="light"] #vaani-back-btn:hover,
body.theme-light #vaani-back-btn:hover {
  background: rgba(90,110,230,0.12);
  color: #3a52c4;
}

/* Page slide animations */
.vn-slide-in-right { animation: vn-from-right 0.24s cubic-bezier(0.33,1,0.68,1) both; }
.vn-slide-in-left  { animation: vn-from-left  0.22s cubic-bezier(0.33,1,0.68,1) both; }
@keyframes vn-from-right {
  from { opacity: 0.6; transform: translateX(28px); }
  to   { opacity: 1;   transform: translateX(0);    }
}
@keyframes vn-from-left {
  from { opacity: 0.6; transform: translateX(-20px); }
  to   { opacity: 1;   transform: translateX(0);     }
}

/* Chat sub-view animations */
.vn-chat-slide-in   { animation: vn-chat-in   0.22s cubic-bezier(0.33,1,0.68,1) both; }
.vn-chat-slide-back { animation: vn-chat-back 0.20s cubic-bezier(0.33,1,0.68,1) both; }
@keyframes vn-chat-in   { from { opacity:0.7; transform:translateX(20px);  } to { opacity:1; transform:translateX(0); } }
@keyframes vn-chat-back { from { opacity:0.7; transform:translateX(-14px); } to { opacity:1; transform:translateX(0); } }

@media (max-width: 480px) {
  #vaani-back-btn { top:10px; left:10px; width:36px; height:36px; }
  #vaani-back-btn svg { width:18px; height:18px; }
}
@media (prefers-reduced-motion: reduce) {
  #vaani-back-btn { transition: opacity 0.1s ease; transform: none !important; }
  .vn-slide-in-right, .vn-slide-in-left,
  .vn-chat-slide-in, .vn-chat-slide-back { animation: none !important; }
}
