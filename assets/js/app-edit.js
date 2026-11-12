// Project editor for the web gallery – window.PGEdit (see docs-webapp-contract.md).
// Every save goes through PG.updateProject(key, fn) and touches only the field the user changed,
// so concurrent edits from the desktop app are not overwritten.
(function () {
  "use strict";

  var DEBOUNCE = 800;
  var STATUS_ORDER = [3, 2, 1, 0];             // Idea, Planned, In progress, Done
  var TASK_LABEL = ["Todo", "Doing", "Done"];
  var uid = 0;

  var CSS = [
    ".pe{font:15px/1.5 var(--sans);color:var(--ink);display:flex;flex-direction:column;gap:16px;min-width:0}",
    ".pe *{box-sizing:border-box}",
    ".pe-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px}",
    ".pe-seg{display:inline-flex;flex-wrap:wrap;border:1.5px solid var(--ink);border-radius:8px;overflow:hidden;background:#FFFDF7;max-width:100%}",
    ".pe-seg button{font:600 13px var(--sans);color:var(--ink-2);background:none;border:0;border-right:1.5px solid var(--ink);padding:7px 11px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;flex:1 1 auto;white-space:nowrap}",
    ".pe-seg button:last-child{border-right:0}",
    ".pe-seg button:hover{background:var(--paper-2)}",
    ".pe-seg button.on{background:var(--marker);color:var(--ink)}",
    ".pe-dot{width:9px;height:9px;border-radius:50%;display:inline-block;flex:none}",
    ".pe-tog{font:600 13px var(--sans);color:var(--ink-2);background:#FFFDF7;border:1.5px solid var(--ink);border-radius:8px;padding:7px 11px;cursor:pointer;white-space:nowrap}",
    ".pe-tog:hover{background:var(--paper-2)}",
    ".pe-tog.on{background:var(--ink);color:var(--paper)}",
    ".pe-tog.pe-fav.on{background:var(--marker);color:var(--ink)}",
    ".pe-state{margin-left:auto;font:12px var(--mono);color:var(--muted);display:inline-flex;align-items:center;gap:8px;min-height:28px}",
    ".pe-state.err{color:#B3261E}",
    ".pe-state button{font:600 12px var(--mono);background:var(--ink);color:var(--paper);border:0;border-radius:6px;padding:4px 9px;cursor:pointer}",
    ".pe-f{display:flex;flex-direction:column;gap:5px;min-width:0}",
    ".pe-f>label,.pe-lab{font:600 11px var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted);display:flex;justify-content:space-between;gap:8px}",
    ".pe-f>label small{font-weight:400;text-transform:none;letter-spacing:0}",
    ".pe-in{font:15px/1.45 var(--sans);color:var(--ink);background:#FFFDF7;border:1.5px solid var(--ink);border-radius:8px;padding:9px 11px;width:100%;min-width:0}",
    ".pe-in:focus,.pe-seg button:focus-visible,.pe-tog:focus-visible,.pe-task button:focus-visible{outline:none;box-shadow:3px 3px 0 var(--marker)}",
    "textarea.pe-in{resize:vertical;min-height:88px}",
    ".pe-chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px;background:#FFFDF7;border:1.5px solid var(--ink);border-radius:8px;padding:6px 8px;min-width:0}",
    ".pe-chip{font:13px var(--mono);background:var(--paper-2);color:var(--ink);border-radius:999px;padding:2px 4px 2px 10px;display:inline-flex;align-items:center;gap:2px;max-width:100%;overflow-wrap:anywhere}",
    ".pe-chip button{font:15px/1 var(--sans);background:none;border:0;color:var(--muted);cursor:pointer;padding:0 5px;border-radius:50%}",
    ".pe-chip button:hover{color:var(--ink);background:var(--marker)}",
    ".pe-chips input{flex:1;min-width:110px;border:0;background:none;font:14px var(--mono);color:var(--ink);padding:4px 2px;outline:none}",
    ".pe-tasks{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}",
    ".pe-task{display:flex;align-items:flex-start;gap:8px;background:#FFFDF7;border:1.5px solid var(--ink);border-radius:8px;padding:6px 8px}",
    ".pe-task .pe-ts{font:600 11px var(--mono);border:1.5px solid var(--ink);border-radius:5px;padding:2px 0;width:52px;flex:none;cursor:pointer;background:#fff;color:var(--ink-2)}",
    ".pe-task.s1 .pe-ts{background:var(--marker);color:var(--ink)}",
    ".pe-task.s2 .pe-ts{background:var(--ink);color:var(--paper)}",
    ".pe-task.s2 .pe-tt{text-decoration:line-through;color:var(--muted)}",
    ".pe-tt{flex:1;min-width:0;overflow-wrap:anywhere;padding-top:1px}",
    ".pe-task .pe-del{font:17px/1 var(--sans);background:none;border:0;color:var(--muted);cursor:pointer;padding:0 4px;flex:none}",
    ".pe-task .pe-del:hover{color:#B3261E}",
    ".pe-empty{color:var(--muted);font-size:14px;margin:0}",
    "@media (max-width:520px){.pe-seg{width:100%}.pe-seg button{padding:7px 8px;justify-content:center}}"
  ].join("\n");

  function injectStyle() {
    if (document.getElementById("pgedit-style")) return;
    var s = document.createElement("style");
    s.id = "pgedit-style";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function now() { return Math.floor(Date.now() / 1000); }

  function clone(o) { return JSON.parse(JSON.stringify(o || {})); }

  function statusLabel(n) { return window.PG && PG.statusLabel ? PG.statusLabel(n) : ["Done", "In progress", "Planned", "Idea"][n]; }
  function statusColor(n) { return window.PG && PG.statusColor ? PG.statusColor(n) : "#999"; }

  // find a task in fresh meta by identity (created + text), fallback to index
  function findTask(tasks, ref, idx) {
    if (!Array.isArray(tasks)) return -1;
    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i];
      if (t && t.created === ref.created && t.text === ref.text) return i;
    }
    var f = tasks[idx];
    return f && f.text === ref.text ? idx : -1;
  }

  function isAuth(err) {
    return err === "auth" || (err && (err.message === "auth" || err.code === "auth"));
  }

  // ------------------------------------------------------------------ mount
  function mount(container, project, onSaved) {
    if (!container || !project) return;
    unmount(container);
    injectStyle();

    var id = "pe" + (++uid);
    var m = clone(project.meta);
    if (!Array.isArray(m.tags)) m.tags = [];
    if (!Array.isArray(m.tasks)) m.tasks = [];

    var st = {
      alive: true,
      queue: [],          // [{id, fn}]
      saving: false,
      failed: false,
      timers: {},
      textVals: {},       // field -> value waiting for debounce
      savedTimer: 0
    };

    var root = el("div", "pe");
    root.setAttribute("data-pgedit", project.key);

    // ---- top bar: status, favorite, hidden, save state
    var bar = el("div", "pe-bar");
    var seg = el("div", "pe-seg");
    seg.setAttribute("role", "group");
    seg.setAttribute("aria-label", "Status");
    STATUS_ORDER.forEach(function (n) {
      var b = el("button");
      b.type = "button";
      b.dataset.s = n;
      var dot = el("span", "pe-dot");
      dot.style.background = statusColor(n);
      b.appendChild(dot);
      b.appendChild(document.createTextNode(statusLabel(n)));
      b.addEventListener("click", function () {
        if (m.status === n) return;
        m.status = n;
        renderStatus();
        enqueue("status", function (meta) { meta.status = n; });
      });
      seg.appendChild(b);
    });

    var fav = el("button", "pe-tog pe-fav");
    fav.type = "button";
    fav.addEventListener("click", function () {
      m.favorite = !m.favorite;
      var v = m.favorite;
      renderToggles();
      enqueue("favorite", function (meta) { meta.favorite = v; });
    });

    var hid = el("button", "pe-tog");
    hid.type = "button";
    hid.addEventListener("click", function () {
      m.hidden = !m.hidden;
      var v = m.hidden;
      renderToggles();
      enqueue("hidden", function (meta) { meta.hidden = v; });
    });

    var stateEl = el("span", "pe-state");
    stateEl.setAttribute("role", "status");
    stateEl.setAttribute("aria-live", "polite");

    bar.appendChild(seg);
    bar.appendChild(fav);
    bar.appendChild(hid);
    bar.appendChild(stateEl);
    root.appendChild(bar);

    // ---- text fields
    function textField(field, label, multi, max, ph) {
      var wrap = el("div", "pe-f");
      var lab = el("label", null, label);
      lab.htmlFor = id + "-" + field;
      var input = el(multi ? "textarea" : "input", "pe-in");
      input.id = id + "-" + field;
      if (!multi) input.type = "text";
      else input.rows = field === "description" ? 4 : 3;
      if (max) input.maxLength = max;
      if (ph) input.placeholder = ph;
      input.value = m[field] == null ? "" : String(m[field]);
      var counter = null;
      if (max) {
        counter = el("small");
        lab.appendChild(counter);
      }
      function count() { if (counter) counter.textContent = input.value.length + "/" + max; }
      count();
      input.addEventListener("input", function () {
        count();
        m[field] = input.value;
        st.textVals[field] = input.value;
        clearTimeout(st.timers[field]);
        st.timers[field] = setTimeout(function () { flushText(field); }, DEBOUNCE);
      });
      input.addEventListener("blur", function () { flushText(field); });
      wrap.appendChild(lab);
      wrap.appendChild(input);
      return wrap;
    }

    function flushText(field) {
      clearTimeout(st.timers[field]);
      delete st.timers[field];
      if (!(field in st.textVals)) return;
      var v = st.textVals[field];
      delete st.textVals[field];
      enqueue("f:" + field, function (meta) { meta[field] = v; });
    }

    root.appendChild(textField("shortDesc", "Short description", false, 200, "One line about the project"));
    root.appendChild(textField("description", "Description", true, 0, "What is it, how does it work…"));

    // ---- tags
    var tagWrap = el("div", "pe-f");
    var tagLab = el("label", null, "Tags");
    tagLab.htmlFor = id + "-tag";
    var chips = el("div", "pe-chips");
    var tagIn = el("input");
    tagIn.id = id + "-tag";
    tagIn.type = "text";
    tagIn.placeholder = "Add tag + Enter";
    tagIn.maxLength = 40;
    chips.addEventListener("click", function (e) { if (e.target === chips) tagIn.focus(); });
    tagIn.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addTag(tagIn.value);
        tagIn.value = "";
      } else if (e.key === "Backspace" && !tagIn.value && m.tags.length) {
        removeTag(m.tags[m.tags.length - 1]);
      }
    });
    tagWrap.appendChild(tagLab);
    tagWrap.appendChild(chips);
    root.appendChild(tagWrap);

    function hasTag(list, t) {
      var l = t.toLowerCase();
      return (list || []).some(function (x) { return String(x).toLowerCase() === l; });
    }
    function addTag(raw) {
      var t = String(raw || "").replace(/,/g, " ").trim().replace(/\s+/g, " ");
      if (!t || hasTag(m.tags, t)) return;
      m.tags.push(t);
      renderTags();
      enqueue(null, function (meta) {
        if (!Array.isArray(meta.tags)) meta.tags = [];
        if (!hasTag(meta.tags, t)) meta.tags.push(t);
      });
    }
    function removeTag(t) {
      m.tags = m.tags.filter(function (x) { return x !== t; });
      renderTags();
      enqueue(null, function (meta) {
        if (Array.isArray(meta.tags)) meta.tags = meta.tags.filter(function (x) { return x !== t; });
      });
    }
    function renderTags() {
      while (chips.firstChild !== tagIn) {
        if (!chips.firstChild) break;
        chips.removeChild(chips.firstChild);
      }
      if (!tagIn.parentNode) chips.appendChild(tagIn);
      m.tags.forEach(function (t) {
        var c = el("span", "pe-chip", t);
        var x = el("button", null, "×");
        x.type = "button";
        x.setAttribute("aria-label", "Remove tag " + t);
        x.addEventListener("click", function () { removeTag(t); });
        c.appendChild(x);
        chips.insertBefore(c, tagIn);
      });
    }

    root.appendChild(textField("nextStep", "Next step", false, 0, "What's the very next thing to do?"));

    // ---- tasks
    var taskWrap = el("div", "pe-f");
    var taskLab = el("div", "pe-lab");
    var taskTitle = el("span", null, "Tasks");
    var taskCount = el("small");
    taskLab.appendChild(taskTitle);
    taskLab.appendChild(taskCount);
    var taskList = el("ul", "pe-tasks");
    var taskIn = el("input", "pe-in");
    taskIn.type = "text";
    taskIn.placeholder = "Add a task + Enter";
    taskIn.setAttribute("aria-label", "New task");
    taskIn.maxLength = 300;
    taskIn.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      var text = taskIn.value.trim();
      if (!text) return;
      taskIn.value = "";
      var t = { text: text, state: 0, created: now(), doneAt: 0, commit: "" };
      m.tasks.push(t);
      renderTasks();
      var copy = clone(t);
      enqueue(null, function (meta) {
        if (!Array.isArray(meta.tasks)) meta.tasks = [];
        meta.tasks.push(copy);
      });
    });
    taskWrap.appendChild(taskLab);
    taskWrap.appendChild(taskList);
    taskWrap.appendChild(taskIn);
    root.appendChild(taskWrap);

    function renderTasks() {
      taskList.textContent = "";
      var done = 0;
      m.tasks.forEach(function (t, i) {
        var s = t.state === 1 || t.state === 2 ? t.state : 0;
        if (s === 2) done++;
        var li = el("li", "pe-task s" + s);
        var sb = el("button", "pe-ts", TASK_LABEL[s]);
        sb.type = "button";
        sb.title = "Change state";
        sb.addEventListener("click", function () { cycleTask(i); });
        var tt = el("span", "pe-tt", t.text);
        var del = el("button", "pe-del", "×");
        del.type = "button";
        del.setAttribute("aria-label", "Delete task");
        del.addEventListener("click", function () { deleteTask(i); });
        li.appendChild(sb);
        li.appendChild(tt);
        li.appendChild(del);
        taskList.appendChild(li);
      });
      if (!m.tasks.length) taskList.appendChild(el("li", "pe-empty", "No tasks yet."));
      taskCount.textContent = m.tasks.length ? done + "/" + m.tasks.length + " done" : "";
    }

    function cycleTask(i) {
      var t = m.tasks[i];
      if (!t) return;
      var ref = { created: t.created, text: t.text };
      var ns = ((t.state | 0) + 1) % 3;
      var doneAt = ns === 2 ? now() : 0;
      t.state = ns;
      t.doneAt = doneAt;
      renderTasks();
      enqueue(null, function (meta) {
        var j = findTask(meta.tasks, ref, i);
        if (j < 0) return;
        meta.tasks[j].state = ns;
        meta.tasks[j].doneAt = doneAt;
      });
    }

    function deleteTask(i) {
      var t = m.tasks[i];
      if (!t) return;
      var ref = { created: t.created, text: t.text };
      m.tasks.splice(i, 1);
      renderTasks();
      enqueue(null, function (meta) {
        var j = findTask(meta.tasks, ref, i);
        if (j >= 0) meta.tasks.splice(j, 1);
      });
    }

    root.appendChild(textField("notes", "Notes", true, 0, "Private notes"));

    // ---- render helpers
    function renderStatus() {
      Array.prototype.forEach.call(seg.children, function (b) {
        var on = +b.dataset.s === m.status;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    function renderToggles() {
      fav.textContent = (m.favorite ? "★" : "☆") + " Favorite";
      fav.classList.toggle("on", !!m.favorite);
      fav.setAttribute("aria-pressed", m.favorite ? "true" : "false");
      hid.textContent = m.hidden ? "Hidden" : "Visible";
      hid.title = m.hidden ? "Hidden from the gallery – click to show" : "Shown in the gallery – click to hide";
      hid.classList.toggle("on", !!m.hidden);
      hid.setAttribute("aria-pressed", m.hidden ? "true" : "false");
    }
    function setState(kind) {
      clearTimeout(st.savedTimer);
      stateEl.textContent = "";
      stateEl.classList.toggle("err", kind === "error" || kind === "auth");
      if (kind === "saving") stateEl.textContent = "Saving…";
      else if (kind === "saved") {
        stateEl.textContent = "Saved ✓";
        st.savedTimer = setTimeout(function () { if (stateEl.textContent === "Saved ✓") stateEl.textContent = ""; }, 2500);
      } else if (kind === "auth") stateEl.textContent = "Session expired – sign in again";
      else if (kind === "error") {
        stateEl.appendChild(document.createTextNode("Couldn't save – retry"));
        var r = el("button", null, "Retry");
        r.type = "button";
        r.addEventListener("click", run);
        stateEl.appendChild(r);
      }
    }

    // ---- save queue (one request at a time, patches applied in order)
    function enqueue(key, fn) {
      if (key) st.queue = st.queue.filter(function (p) { return p.id !== key; });
      st.queue.push({ id: key, fn: fn });
      run();
    }

    function run() {
      if (st.saving || !st.queue.length) return;
      if (!window.PG || !PG.updateProject) { st.failed = true; setState("error"); return; }
      var batch = st.queue;
      st.queue = [];
      st.saving = true;
      st.failed = false;
      if (st.alive) setState("saving");
      PG.updateProject(project.key, function (meta) {
        batch.forEach(function (p) { p.fn(meta); });
      }).then(function (res) {
        st.saving = false;
        if (st.alive) {
          if (!st.queue.length) setState("saved");
          if (typeof onSaved === "function") {
            try { onSaved(res); } catch (e) { if (window.console) console.error(e); }
          }
        }
        run();
      }, function (err) {
        st.saving = false;
        st.failed = true;
        // put failed patches back in front, newer edits of the same field win
        var ids = {};
        st.queue.forEach(function (p) { if (p.id) ids[p.id] = 1; });
        st.queue = batch.filter(function (p) { return !p.id || !ids[p.id]; }).concat(st.queue);
        if (st.alive) setState(isAuth(err) ? "auth" : "error");
      });
    }

    function pending() {
      return st.saving || st.queue.length > 0 || Object.keys(st.textVals).length > 0;
    }
    function onBeforeUnload(e) {
      Object.keys(st.textVals).forEach(flushText);
      if (pending()) { e.preventDefault(); e.returnValue = ""; return ""; }
    }
    window.addEventListener("beforeunload", onBeforeUnload);

    renderStatus();
    renderToggles();
    renderTags();
    renderTasks();

    container.textContent = "";
    container.appendChild(root);

    container.__pgedit = {
      destroy: function () {
        // send any text still waiting for its debounce, then stop touching the DOM
        Object.keys(st.textVals).forEach(flushText);
        st.alive = false;
        clearTimeout(st.savedTimer);
        window.removeEventListener("beforeunload", onBeforeUnload);
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  function unmount(container) {
    if (!container || !container.__pgedit) return;
    var h = container.__pgedit;
    container.__pgedit = null;
    h.destroy();
  }

  window.PGEdit = { mount: mount, unmount: unmount };
})();
