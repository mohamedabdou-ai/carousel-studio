/* src/qa-visual/register.js - owned by F3. CS.qav.add(scope, gate) puts a gate into CS.qa._.gates[scope] (text or
 * rendered); until that hook exists the gate waits in a queue that flush() and every add retry. */
(function () {
  var qav = (CS.qav = CS.qav || {}), queue = [];

  /** Moves queued gates into the hook when present; returns how many still wait. */
  qav.flush = function flush() {
    var hook = CS.qa && CS.qa._ && CS.qa._.gates;
    queue = queue.filter(function (q) {
      var l = hook && hook[q.scope];
      if (!l) return true;
      if (l.indexOf(q.gate) < 0) l.push(q.gate);
      return false;
    });
    return queue.length;
  };
  qav.add = function add(scope, gate) {
    if (scope !== "text" && scope !== "rendered") throw new Error("CS.qav.add: scope is text or rendered");
    queue.push({ scope: scope, gate: gate });
    qav.flush();
    return gate;
  };
})();
