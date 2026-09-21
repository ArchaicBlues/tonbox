class CDControls {
  constructor(options = {}) {
    // options:
    // container: DOM element or selector where to render buttons (if omitted, no auto-render)
    // buttons: array of names to include (defaults below)
    // classPrefix: prefix for generated classes/ids
    // onEvent: optional callback receiving (eventName, detail)
    this.options = Object.assign({
      buttons: ['prev','play','stop','next','eject'],//,'tracklist'],
      classPrefix: 'cdctrl',
      container: null,
      onEvent: null
    }, options);

    this.state = {
      playing: false,
      track: null,
      enabled: true
    };

    this._elements = {};
    if (this.options.container) this.render(this.options.container);
  }

  // Render buttons into container (selector or element)
  render(container) {
    const root = (typeof container === 'string') ? document.querySelector(container) : container;
    if (!root) throw new Error('CDControls: render target not found');

    const wrapper = document.createElement('div');
    wrapper.className = `${this.options.classPrefix}-wrapper btn-group`;
    wrapper.setAttribute('role','group');
    wrapper.style.gap = '0.35rem';

    /* ---- CENTER THE BUTTONS ---- */
    wrapper.style.display = 'flex';
    wrapper.style.justifyContent = 'center';
    wrapper.style.width = '100%';

    const btnMap = {
      prev: { label: '⏮', title:'Previous' },
      play: { label: '▶', title:'Play' },
      // pause: { label: '⏸', title:'Pause' },
      stop: { label: '⏹', title:'Stop' },
      next: { label: '⏭', title:'Next' },
      eject: { label: '⏏', title:'Eject' },
      //tracklist: { label: 'Search', title:'Tracklist' }
    };

    this.options.buttons.forEach(name => {
      const info = btnMap[name] || { label: name, title: name };
      const btn = document.createElement('button');
      btn.type = 'button';

      //btn.className = `btn btn-sm btn-dark ${this.options.classPrefix}-${name}`;
      const btnColor = (name === 'tracklist') ? 'btn-primary' : 'btn-dark';
      btn.className = `btn btn-sm ${btnColor} ${this.options.classPrefix}-${name}`;

      btn.id = `${this.options.classPrefix}-${name}`;
      btn.title = info.title;
      btn.innerHTML = `<span aria-hidden="true">${info.label}</span>`;
      btn.style.minWidth = '2.6rem';
      wrapper.appendChild(btn);
      this._elements[name] = btn;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log("click Event")
        this._handle(name);
      });
    });

    root.appendChild(wrapper);
    this._root = wrapper;
    this._updateVisualState();
    return wrapper;
  }

  // Bind existing DOM buttons by selector map { play: '#playBtn', ... }
  bind(selectors = {}) {
    console.log("bind()")
    Object.keys(selectors).forEach(name => {
      const sel = selectors[name];
      const el = (typeof sel === 'string') ? document.querySelector(sel) : sel;
      if (!el) return;
      this._elements[name] = el;
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this._handle(name);
      });
    });
    this._updateVisualState();
  }

  // internal dispatcher for custom events + optional callback
  _dispatch(eventName, detail = {}) {
    const ev = new CustomEvent(eventName, { detail, bubbles: true });
    if (this._root && this._root.parentNode) {
      this._root.parentNode.dispatchEvent(ev);
    } else {
      document.dispatchEvent(ev);
    }
    if (typeof this.options.onEvent === 'function') {
      try { this.options.onEvent(eventName, detail); 

      } catch(e){
        console.error(e); 
      }
    }
  }

  // central handler
  _handle(action) {
    console.log("_handle("+action+"): state="+this.state.enabled)
    if (!this.state.enabled) return;
    switch(action) {
      case 'play':
        this.play();
        break;
      // case 'pause':
      //   this.pause();
      //   break;
      case 'stop':
        this.stop();
        break;
      case 'next':
        this.next();
        break;
      case 'prev':
        this.prev();
        break;
      case 'eject':
        this.eject();
        break;
      case 'tracklist':
        this.tracklist();
        break;
      default:
        this._dispatch('cd:unknown', { action });
    }
  }

  //tracklist action
  playTrack(trackNr) {
      console.log("playTrack()")
      if (!trackNr || isNaN(trackNr)) return;
      console.log("playTrack() ok")
      this.state.track = trackNr;
      this.state.playing = true;
      this._updateVisualState();
      this._dispatch('cd:playtrack', { track: trackNr });
  }


  play() {
    console.log("play()")
    if (this.state.playing) return;
    console.log("play() ok")
    this.state.playing = true;
    this._updateVisualState();
    this._dispatch('cd:play', { track: this.state.track });
  }
  // pause() {
  //   if (!this.state.playing) return;
  //   this.state.playing = false;
  //   this._updateVisualState();
  //   this._dispatch('cd:pause', { track: this.state.track });
  // }
  // stop() {
  //   this.state.playing = false;
  //   this._updateVisualState();
  //   this._dispatch('cd:stop', {});
  // }
  // next() {
  //   this._dispatch('cd:next', {});
  // }
  // prev() {
  //   this._dispatch('cd:prev', {});
  // }
  stop() {
    this.state.playing = false;
    this._dispatch('cd:stop', {});
  }

  next() {
    this._dispatch('cd:next', {});
  }

  prev() {
    this._dispatch('cd:prev', {});
  } 

  eject() {
    this.state.playing = false;
    this._updateVisualState();
    this._dispatch('cd:eject', {});
  }
  
  tracklist() {
    this._dispatch('cd:tracklist', {});
  }

  // enable/disable whole control
  enable() {
    this.state.enabled = true;
    this._updateVisualState();
  }
  disable() {
    this.state.enabled = false;
    this._updateVisualState();
  }

  // update button looks (add active/disabled classes)
  _updateVisualState()
  {
    const el = this._elements;
    if (el.play) {
      el.play.classList.toggle('active', this.state.playing);
    }
    Object.values(el).forEach(b => {
      if (!b) return;
      b.disabled = !this.state.enabled;
    });
    Object.values(el).forEach(b => {
      if (!b) return;
      b.disabled = !this.state.enabled;
      if (this.state.enabled) 
        b.classList.remove('disabled'); 
      else 
        b.classList.add('disabled');
    });
    // if (el.pause) {
    //   el.pause.classList.toggle('active', !this.state.playing && el.pause.classList.contains('active'));
    // }
    // disabled state
  }

  // // programmatically set current track info
  // setTrack(info = {}) {
  //   this.state.track = info;
  //   this._dispatch('cd:trackchange', { track: info });
  // }

  // destroy and remove DOM listeners
  destroy() {
    Object.values(this._elements).forEach(el => {
      if (!el) return;
      el.replaceWith(el.cloneNode(true)); // quick detach listeners
    });
    if (this._root && this._root.parentNode) this._root.remove();
    this._elements = {};
    this._root = null;
  }

  // setPlaying(isPlaying) {
  //   console.log("setPlaying="+isPlaying)
  //   this.state.playing = !!isPlaying;
  //   this._updateVisualState();
  // }

  setTrack(trackNr) {
    console.log("setTrack="+trackNr)
    this.state.track = trackNr;
    this._updateVisualState();
  }

  reset() {
    this.state.playing = false;
    this.state.track = null;
    this._updateVisualState();
  }


}

// export for module usage, also attach to window for simple script include
if (typeof window !== 'undefined') { //“Only do this if we are running in a browser”
  window.CDControls = CDControls;
}
export default CDControls; //allows another file to import the class
