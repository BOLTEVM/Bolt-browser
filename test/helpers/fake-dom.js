/* global jest */

const createClassList = (initialClasses = []) => {
  const classes = new Set(initialClasses);

  return {
    add: jest.fn((...names) => {
      names.forEach((name) => classes.add(name));
    }),
    remove: jest.fn((...names) => {
      names.forEach((name) => classes.delete(name));
    }),
    toggle: jest.fn((name, force) => {
      if (force === undefined) {
        if (classes.has(name)) {
          classes.delete(name);
          return false;
        }

        classes.add(name);
        return true;
      }

      if (force) {
        classes.add(name);
      } else {
        classes.delete(name);
      }

      return force;
    }),
    contains: jest.fn((name) => classes.has(name)),
    toArray: () => Array.from(classes),
  };
};

const getDataAttributeName = (selector) => {
  const match = selector.match(/^\[data-([a-z-]+)="([^"]+)"\]$/);
  if (!match) return null;

  return {
    key: match[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase()),
    value: match[2],
  };
};

const matchesSelector = (element, selector) => {
  if (selector.startsWith('.')) {
    return element.classList.contains(selector.slice(1));
  }

  if (selector === 'webview') {
    return element.tagName === 'WEBVIEW';
  }

  if (selector === 'webview:not(.hidden)') {
    return element.tagName === 'WEBVIEW' && !element.classList.contains('hidden');
  }

  const dataAttr = getDataAttributeName(selector);
  if (dataAttr) {
    return element.dataset[dataAttr.key] === dataAttr.value;
  }

  return false;
};

class FakeElement {
  constructor(tagName = 'div', options = {}) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = { ...(options.dataset || {}) };
    this.style = { ...(options.style || {}) };
    this.handlers = {};
    this.attributes = {};
    this.disabled = options.disabled || false;
    this.draggable = false;
    this.innerHTML = options.innerHTML || '';
    this.textContent = options.textContent || '';
    this.value = options.value || '';
    this.src = options.src || '';
    this.alt = options.alt || '';
    this.onclick = null;
    this.onerror = null;
    this._classes = createClassList(options.classes || []);
    this.classList = this._classes;
    this._className = this.classList.toArray().join(' ');
    this._rect = options.rect || {
      left: 0,
      top: 0,
      right: 100,
      bottom: 40,
      width: 100,
      height: 40,
    };

    Object.defineProperty(this, 'className', {
      get: () => this._className,
      set: (value) => {
        this._className = value;
        this._classes = createClassList(
          String(value)
            .split(/\s+/)
            .map((part) => part.trim())
            .filter(Boolean)
        );
        this.classList = this._classes;
      },
    });
  }

  get firstChild() {
    return this.children[0] || null;
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.children.indexOf(this);
    return this.parentNode.children[index + 1] || null;
  }

  setRect(rect) {
    this._rect = { ...this._rect, ...rect };
  }

  getBoundingClientRect() {
    return { ...this._rect };
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    this[name] = value;
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  addEventListener(event, handler) {
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }
    this.handlers[event].push(handler);
  }

  removeEventListener(event, handler) {
    const listeners = this.handlers[event];
    if (!listeners) return;
    this.handlers[event] = listeners.filter((listener) => listener !== handler);
  }

  dispatch(event, payload = {}) {
    const listeners = this.handlers[event] || [];
    listeners.forEach((listener) => listener(payload));
  }

  appendChild(child) {
    if (child.parentNode) {
      child.remove();
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  prepend(child) {
    if (child.parentNode) {
      child.remove();
    }
    child.parentNode = this;
    this.children.unshift(child);
    return child;
  }

  after(sibling) {
    if (!this.parentNode) return;
    if (sibling.parentNode) {
      sibling.remove();
    }

    const index = this.parentNode.children.indexOf(this);
    sibling.parentNode = this.parentNode;
    this.parentNode.children.splice(index + 1, 0, sibling);
  }

  remove() {
    if (!this.parentNode) return;

    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) {
      this.parentNode.children.splice(index, 1);
    }
    this.parentNode = null;
  }

  contains(target) {
    if (this === target) return true;
    return this.children.some((child) => child.contains(target));
  }

  querySelector(selector) {
    for (const child of this.children) {
      if (matchesSelector(child, selector)) {
        return child;
      }

      const nested = child.querySelector(selector);
      if (nested) {
        return nested;
      }
    }

    return null;
  }

  querySelectorAll(selector) {
    const results = [];

    for (const child of this.children) {
      if (matchesSelector(child, selector)) {
        results.push(child);
      }
      results.push(...child.querySelectorAll(selector));
    }

    return results;
  }

  focus() {}

  blur() {}

  select() {}
}

const createElement = (tagName = 'div', options = {}) => new FakeElement(tagName, options);

const createDocument = ({ elementsById = {}, createElementOverride } = {}) => {
  const documentHandlers = {};

  return {
    handlers: documentHandlers,
    createElement: jest.fn((tagName) => {
      if (createElementOverride) {
        return createElementOverride(tagName);
      }
      return createElement(tagName);
    }),
    getElementById: jest.fn((id) => elementsById[id] || null),
    addEventListener: jest.fn((event, handler) => {
      documentHandlers[event] = handler;
    }),
  };
};

module.exports = {
  FakeElement,
  createClassList,
  createDocument,
  createElement,
};
