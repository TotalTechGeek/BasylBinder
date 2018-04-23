/*! 
 * BasylBinder
 * 
 * Copyright 2018, Jesse Daniel Mitchell
 * Released under the MIT license.
 *
 * Date: 2018-04-22T22:35:32.502Z
 */
if (typeof window.$$ === "undefined")
{
    $$ = function(e)
    {
        if (e instanceof Event) return $$.from(e.target);
        if (e instanceof HTMLElement || typeof e === "object")
        {
            return $$.from(e);
        }
    }
}
else
{
    var z = window.$$;
    $$ = function(e, x)
    {
        if (e instanceof Event) return $$.from(e.target);
        if (e instanceof HTMLElement || typeof e === "object")
        {
            return $$.from(e);
        }

        return z(e, x);
    }
}

function createBasylBinder($$)
{
    $$.bindings = {}
    $$.bindUpdates = {}
    $$.updates = {}
    $$.components = {}
    var forceUpdate = 0;

    const LOCAL_BIND_ID = "local-bind";
    const BASYL_VARS = "vars";
    const BASYL_SCRIPT = "basyl-script";
    const BASYL_DVARS = "dvars";

    $$.queueUpdate = function(name, time)
    {
        if (typeof $$.updates[name] !== "undefined")
        {
            clearTimeout($$.updates[name]);
        }
        $$.updates[name] = setTimeout(() =>
        {
            $$.update(name);
            delete $$.updates[name];
        }, time);
    }

    $$.bind = function(name, n)
    {
        name = name.toLowerCase()
        if (typeof n === "string") n = n.toLowerCase()
        if (typeof $$.bindings[name] !== "undefined")
        {
            $$.bindings[name][2].push(n);
        }
        return $$;
    }

    $$.forget = function(name)
    {
        name = name.toLowerCase()
        delete $$.bindings[name];
        return $$;
    }

    $$.emptyFunction = function() {}

    $$._bindElementFormat = function(el, func)
    {
        el.value = func(el.value);
        var prev = el.onchange || $$.emptyFunction;
        el.onchange = e =>
        {
            e.target.value = func(e.target.value);
            prev(e);
            el.oninput && el.oninput(e);
        }
        return $$;
    }

    $$._bindElementDVar = function(name, el, attr, oneWay)
    {
        // Get the Bind-Index of the DVAR
        let id = $$.bindings[name][0]().count();

        let get = () => $$.bindings[name][0]().get(id)
        let set = val =>
        {
            $$.bindings[name][0]().set(val, id)
            $$.update(name)
        }

        if (typeof el.attributes["bind-index"] !== "undefined")
        {
            // If it has a bind index defined, set it to that location.
            id = (el.getAttribute("bind-index"));

            if (typeof get() === "undefined") set("");
        }
        else
        {
            // Generate a bind index.
            while (typeof get() !== "undefined") id++;
            el.setAttribute("bind-index", id);
            set("")
        }

        if (!oneWay)
        {

            var updateMethod = function()
            {
                el[attr] = get()

                // Tells the code to delete this update function
                // if this element ceases to exist.
                if (!el.parentNode)
                {
                    var z = $$.bindings[name][2].indexOf(updateMethod);
                    $$.bindings[name][2].splice(z, 1);
                }
            }

            $$.bindings[name][2].push(updateMethod);
            el[attr] = get();
        }

        $$._bindElementFinal(name, el, attr, get, set)
    }

    $$._bindElementNormal = function(name, el, attr, oneWay)
    {
        if (!oneWay)
        {
            // If it isn't one way, update the current value and tell it to update this value
            $$.bindings[name][2].push([el, attr]);
            el[attr] = $$.bindings[name][0]();
        }

        $$._bindElementFinal(name, el, attr, () => $$.get(name), val => $$.set(name, val))
    }

    $$._bindElementFinal = function(name, el, attr, get, set)
    {
        // If it's some sort of editable field
        // There's a small bug here I'll fix later, I need to actually check if the content-editable field is set to true.
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.hasAttribute("contenteditable"))
        {
            // Good for most types of input...
            el.oninput = (e) =>
            {
                if (typeof $$.bindings[name] === "undefined")
                {
                    delete el.oninput;
                    return;
                }

                // Used to prevent annoying field cursor resets.
                const allowed = ["text", "url", "password", "telephone", "search"]
                if (get() != e.target[attr])
                {
                    if ((el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) && allowed.indexOf((el.getAttribute('type') || "").toLowerCase().trim()) !== -1)
                    {
                        var s = el.selectionStart,
                            end = el.selectionEnd;
                        set(e.target[attr])

                        // Prevents annoying field cursor reset.
                        el.setSelectionRange(s, end);
                    }
                }
                else
                {
                    set(e.target[attr])
                }
            }

            if (el.attributes["type"] && (el.getAttribute("type") === "checkbox" || el.getAttribute("type") === "file"))
                el.onchange = (e) =>
                {
                    if (typeof $$.bindings[name] === "undefined")
                    {
                        delete el.oninput;
                        return;
                    }

                    if (get() != e.target[attr])
                    {
                        if (el.hasAttribute("on-true") && e.target[attr] == true)
                        {
                            set(el.getAttribute("on-true"))
                        }
                        else if (el.hasAttribute("on-false") && e.target[attr] == false)
                        {
                            set(el.getAttribute("on-false"))
                        }
                        else
                        {
                            set(e.target[attr])
                        }
                    }
                }
        }

    }

    $$._bindElement = function(name, el, attr, oneWay)
    {
        oneWay = (typeof oneWay === "undefined") ? false : oneWay;
        name = closest2(el, name);

        // Checks if the binding exists, and the element we're binding to exists.
        if (typeof $$.bindings[name] !== "undefined" && typeof el !== "undefined")
        {

            // This code is for d-vars, and needs major refactoring.
            if ($$.bindings[name].length == 4 && $$.bindings[name][3] == "Array")
            {
                $$._bindElementDVar(name, el, attr, oneWay)
            }
            else
            {
                $$._bindElementNormal(name, el, attr, oneWay)
            }

        }
        return $$;
    }

    $$.create = function(name, getter, setter)
    {
        name = name.toLowerCase()
        var getter = getter || $$.emptyFunction;
        var setter = setter || $$.emptyFunction;
        $$.bindUpdates[name] = false;
        $$.bindings[name] = [getter, setter, []];
        return $$;
    }

    $$.createView = function(name, formattedName, mutator)
    {
        name = name.toLowerCase(), formattedName = formattedName.toLowerCase()
        if (typeof $$.bindings[name] === "undefined") $$.htmlvars();
        $$.create(formattedName, () => mutator($$.get(name)));
        $$.bind(name, formattedName);
        return $$;
    }

    $$.update = function(name)
    {
        name = name.toLowerCase()
        if (typeof $$.bindings[name] !== "undefined")
        {
            if ($$.bindUpdates[name]) return $$;
            $$.bindUpdates[name] = true;
            $$.bindings[name][2].forEach((x) =>
            {
                if (typeof x === "string")
                {
                    $$.update(x);
                }
                else if (typeof x === "function")
                {
                    x();
                }
                else
                {
                    x[0][x[1]] = $$.bindings[name][0]();
                }
            });

            $$.bindUpdates[name] = false;
        }

        return $$;
    }

    $$.dget = function(name)
    {
        name = name.toLowerCase()
        if (typeof $$.bindings[name] !== "undefined")
        {
            return $$.get(name).arr;
        }
    }

    $$.get = function(name)
    {
        name = name.toLowerCase()
        if (typeof $$.bindings[name] !== "undefined")
        {
            return $$.bindings[name][0]();
        }
    }

    $$.set = function(name, v)
    {
        name = name.toLowerCase();
        if (typeof $$.bindings[name] !== "undefined")
        {
            if ($$.bindUpdates[name]) return;
            $$.bindings[name][1](v);
            $$.update(name);
        }
        return $$;
    }

    if (!Element.prototype.matches)
    {
        Element.prototype.matches =
            Element.prototype.matchesSelector ||
            Element.prototype.mozMatchesSelector ||
            Element.prototype.msMatchesSelector ||
            Element.prototype.oMatchesSelector ||
            Element.prototype.webkitMatchesSelector ||
            function(s)
            {
                var matches = (this.document || this.ownerDocument).querySelectorAll(s),
                    i = matches.length;
                while (--i >= 0 && matches.item(i) !== this)
                {}
                return i > -1;
            }
    }

    $$._fromId = function(x)
    {
        return $$.from(document.getElementById(x));
    }

    function closest2(el, key)
    {
        key = key.toLowerCase();
        var y;
        if (y = closest(el, key))
        {
            return y.getAttribute(LOCAL_BIND_ID).toLowerCase() + ':' + key;
        }

        if (typeof $$.bindings[key] !== "undefined")
            return key;

        return null;
    }

    $$.closest = function(el, key, selector)
    {
        var selector = (typeof selector === "undefined") ? "[" + LOCAL_BIND_ID + "]" : selector;
        var retval = null;
        while (el)
        {
            if (el.matches(selector))
            {
                if (typeof key === "undefined" || key === "" || typeof $$.bindings[el.getAttribute(LOCAL_BIND_ID).toLowerCase() + ':' + key.toLowerCase()] !== 'undefined')
                {
                    retval = el;
                    break
                }
            }
            el = el.parentElement;
        }
        return retval;
    }

    var closest = $$.closest;

    $$._randStr = () => Math.random().toString(36).substring(2)

    $$._fromInput = function(x)
    {
        var result = {}

        result.bind = function(name, oneWay)
        {
            $$._bindElement(name, x, "value", oneWay);
            return result;
        }
        result.bindEvent = function() {}
        result.format = function(func)
        {
            $$._bindElementFormat(x, func);
            return result;
        }
        return result;
    }

    function htmlDecode(input)
    {
        var doc = new DOMParser().parseFromString(input, "text/html");
        return doc.documentElement.textContent;
    }

    $$._fromElement = function(x)
    {
        var result = {}

        result.bind = function(name, attr, oneWay)
        {
            $$._bindElement(name, x, attr, oneWay);
            return result;
        }

        result.bindEvent = function() {}

        return result;
    }

    $$.from = function(x)
    {

        if (typeof x === "string")
        {
            if (x.indexOf("#") === 0) return $$._fromId(x.substring(1));

            if (x.indexOf("$*") === 0)
            {
                var arr = document.querySelectorAll(x.substring(2));
                arr = $$.from(arr).do(i => $$.from(i));
                return $$.from(arr);
            }
            if (x.indexOf("$") === 0) return $$.from(document.querySelector(x.substring(1)));
        }

        var result;

        if (x instanceof HTMLElement)
        {
            function escapeRegExp(str)
            {
                return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
            }

            function onlyUnique(value, index, self)
            {
                return self.indexOf(value) === index;
            }

            if (x instanceof HTMLInputElement)
            {
                result = $$._fromInput(x);
            }
            else result = $$._fromElement(x);

            result.var = function(name, v, g, s)
            {
                var y;
                if (y = closest(x))
                {
                    var y = y.getAttribute(LOCAL_BIND_ID);
                    return $$.var(y + ":" + name, v, g, s);
                }
                return $$.var(name, v, g, s);
            }

            result.dvar = function(name, v, g, s)
            {
                var y;
                if (y = closest(x))
                {
                    var y = y.getAttribute(LOCAL_BIND_ID);
                    return $$.dvar(y + ":" + name, v, g, s);
                }
                return $$.dvar(name, v, g, s);
            }

            result.bind = function(name, n)
            {
                var y;
                if (y = closest(x))
                {
                    var y = y.getAttribute(LOCAL_BIND_ID);
                    return $$.bind(y + ":" + name, n);
                }
                return $$.dvar(name, n);
            }

            result.watch = function(attr)
            {

                if (attr == "text") attr = "*textContent";
                if (attr == "html") attr = "*innerHTML";
                var orig = attr;
                if (attr === "*textContent") attr = "*innerHTML";

                if ((x instanceof HTMLStyleElement || x instanceof HTMLScriptElement) && attr === "*innerHTML") attr = "-html";

                var optimize = false;
                var full = false;
                if (attr.charAt(0) == "*")
                {
                    full = true;
                    optimize = true;
                    attr = attr.substring(1);
                }
                else
                if (attr == "-html")
                {
                    full = true;
                    attr = "innerHTML";
                }

                var str;
                if (full) str = x[attr];
                else str = (x.getAttribute(attr) || "");
                // str = "{{Hello}}", str.match(/\{\{[A-Za-z]+(\|.+)?\}\}/g).map(i=>i.substring(2,i.length-2).split("|"))
                var vals = (str.toString().match(/\{\{[A-Za-z0-9\-_#]+(\|[^}]+(\}[^}]+)?)*\}\}/g) || []).map(i =>
                {
                    var z = i.substring(2, i.length - 2).split("|")
                    var val = z[0];
                    z[0] = "";
                    return [val.toLowerCase(), z.join("|").substring(1), escapeRegExp(i)];
                });

                var f;
                vals = vals.filter(v => closest2(x, v[0])).filter(onlyUnique);
                var vals2 = vals.map(i => new RegExp(i[2], "g"));
                var skip = false;

                f = () =>
                {
                    var str2 = str.toString();
                    if (optimize)
                    {
                        skip = true;
                        $$.from(x.childNodes).for((it, i) =>
                        {
                            if (it instanceof HTMLElement)
                            {
                                $$.from(it).watch(orig);
                                $$.from(it.attributes).for(i =>
                                {
                                    if (vals2.some(k => i.value.match(k))) $$.from(it).watch(i.name);
                                });
                            }
                            else if (it instanceof Text)
                            {
                                str2 = it.data;

                                if (str2.trim() !== "")
                                {
                                    vals2.forEach((j, i) =>
                                    {
                                        var nam = closest2(x, vals[i][0]);

                                        // Hackish solution - Todo: Add a developer notification to ask them to create a new view themselves.
                                        if (vals[i][1] !== "")
                                        {
                                            nam = $$._randStr();
                                            $$.createView(vals[i][0], nam, new Function(vals[i][0], "return " + htmlDecode(vals[i][1])));
                                        }
                                        var extra = (orig === "*innerHTML") ? 'bind-to="innerHTML"' : '';
                                        str2 = str2.replace(j, '<v bind="' + nam + '"' + extra + '></v>');
                                    });
                                    // console.log(str2);
                                    it.parentNode.replaceChild(new DOMParser().parseFromString("<v>" + str2 + "</v>", "text/html").childNodes[0].childNodes[1].childNodes[0], it);
                                }
                            }
                        });
                    }
                    else
                    {

                        vals2.forEach((j, i) =>
                        {
                            if (vals[i][1] !== "")
                            {
                                var lam = new Function(vals[i][0], "return " + vals[i][1]);
                                str2 = str2.replace(j, lam($$(x).get(vals[i][0])));
                            }
                            else
                            {
                                str2 = str2.replace(j, $$(x).get(vals[i][0]));
                            }
                        })
                    }
                    if (!skip)
                    {
                        if (full)
                            x[attr] = str2;
                        else
                            x.setAttribute(attr, str2);
                    }
                }

                vals.forEach((i, ind) =>
                {
                    i = i[0];
                    if (!optimize)
                        $$.bind(closest2(x, i), f);
                });

                f();
            }

            result.get = function(z)
            {
                return $$.get(closest2(x, z));
            }

            result.cget = function(z)
            {
                var c = $$.closest(x, "", "component");
                var type = c.getAttribute("type")
                var z = $$.components[type][1].split(' ').indexOf(z);
                var j = c.getAttribute('was-from').split(' ')[z];
                return result.get(j);
            }

            result.cset = function(z, v)
            {
                var c = $$.closest(x, "", "component");
                var type = c.getAttribute("type")
                var z = $$.components[type][1].split(' ').indexOf(z);
                var j = c.getAttribute('was-from').split(' ')[z];
                return result.set(j, v);
            }

            result.set = function(z, v)
            {
                return $$.set(closest2(x, z), v);
            }

            return result;
        }

        result = {}

        if (x instanceof Array)
        {
            result.do = (y, i) => x.map(y, i);
            result.for = (y, i) => x.forEach(y, i);
        }
        else
        {
            result.for = (y) =>
            {
                var max = x.length;
                for (var i = 0; i < max; i++)
                {
                    y(x[i], i);
                }
            }

            result.do = (y) =>
            {
                var result = [];
                var max = x.length;
                for (var i = 0; i < max; i++)
                {

                    var item = y(x[i], i);
                    if (item !== undefined && item !== null)
                    {
                        result.push(item);
                    }
                }
                return result;
            }

        }

        // transposes a matrix
        result.transpose = () =>
        {
            var transpose = (y, i) => x[i].map((y, i) => x.map(y => y[i]))
            var cur = result.max()[0];
            return transpose(x, cur);
        }

        result.max = () =>
        {
            var max = 0,
                cur = 0;
            for (var i = 0; i < x.length; i++)
            {
                if (x[i].length > max)
                {
                    max = x[i].length;
                    cur = i;
                }
            }
            return [cur, max];
        }

        result.sum = () =>
        {
            var sum = 0;
            x.forEach(i => sum += (parseFloat(i) || 0));
            return sum;
        }

        result.ffor = (y, z) =>
        {
            var max = x.length;
            for (var i = 0; i < max; i++)
            {
                z(x[i]) && y(x[i], i);
            }
        }

        result.table = function(options)
        {
            var options = options ||
            {}
            if (typeof options.fill === "undefined") options.fill = "";
            if (typeof options.head === "undefined") options.head = [];
            var max = result.max()[1];

            for (var i = 0; i < x.length; i++)
            {
                while (x[i].length < max) x[i].push("");
            }

            var tbody = "<tbody>" + x.map(i => "<tr>" + i.map(j => "<td>" + (j || options.fill) + "</td>").join("") + "</tr>").join("") + "</tbody>";
            var thead = "";

            if (options.head.length)
            {
                thead = "<thead><tr>" + options.head.map(i => "<th>" + i + "</th>").join('') + "</tr></thead>";
            }

            return "<table>" + thead + tbody + "</table>";
        }

        result.fdo = (y, z) =>
        {
            var result = [];
            var max = x.length;
            for (var i = 0; i < max; i++)
            {
                var item = z(x[i]) ? y(x[i], i) : null;
                if (item !== undefined && item !== null)
                {
                    result.push(item);
                }
            }
            return result;
        }

        return result;
    }

    $$.templates = {
        getInt: (v) => parseInt(v.val) || 0,
        getPosInt: (v) =>
        {
            var x = parseInt(v.val)
            return x < 0 ? -x : x || 0
        },
        getFloat: (v) => parseFloat(v.val) || 0,
        getAny: (v) => v.val || "",
        setInt: (t, v) => t.val = parseInt(v),
        setFloat: (t, v) => t.val = parseFloat(v),
        setAny: (t, v) => t.val = v
    }

    $$._CV = function(v, g, s)
    {
        var obj = {}
        obj.val = (v) ? v : "";
        var get = (g) ? g : $$.templates.getAny;
        var set = (s) ? s : $$.templates.setAny;
        obj.set = (v) => set(obj, v);
        obj.get = () => get(obj);
        return obj;
    }

    $$.dvar = function(name)
    {
        name = name.toLowerCase();
        var obj = {
            arr: []
        }
        var set = (obj, v, i) => obj.arr[i] = v;
        var get = (obj, i) => obj.arr[i];
        obj.set = (v, i) => set(obj, v, i);
        obj.get = (i) => get(obj, i);
        obj.count = () => obj.arr.length;
        $$.create(name, () => obj);
        $$.bindings[name].push("Array");
        return $$;
    }

    $$.search = function(name)
    {
        return Object.keys($$.bindings).filter(i => i.match(name));
    }

    // This will be added later on. 
    // This will allow you to specify constant variables that won't change.
    $$.const = function(name, v)
    {
        return $$.var(name, v);
    }

    $$.var = function(name, v, g, s)
    {
        var a = new $$._CV(v, g, s);
        $$.create(name, a.get, a.set);
        return $$;
    }

    $$.range = function(x, y)
    {
        return [...Array(y - x + 1).keys()].map(i => i + x);
    }

    $$.localScopes = function()
    {

        var from = (typeof from === "undefined") ? "" : (from + " ");
        $$.from(document.querySelectorAll(from + "[" + LOCAL_BIND_ID + "]")).for(i =>
        {
            if (i.getAttribute(LOCAL_BIND_ID) === "")
            {
                i.setAttribute(LOCAL_BIND_ID, $$._randStr());
            }
        });
    }

    $$.style = function()
    {
        $$.from(document.querySelectorAll('basyl-style,script[type="basyl-style"]')).for(i =>
        {
            var a = document.createElement("style");
            a.innerHTML = i.innerHTML;
            i.parentNode.replaceChild(a, i);
            $$.from(a).watch("-html");
        });
    }

    $$.htmlvars = function(from)
    {
        var from = (typeof from === "undefined") ? "" : (from + " ");
        $$.localScopes();
        $$.from(document.querySelectorAll(from + BASYL_VARS)).for(el =>
        {
            $$.from(el.attributes).for(i => $$(el).var(i.name, i.value));
            el.parentNode.removeChild(el);
        });
        $$.from(document.querySelectorAll(from + BASYL_DVARS)).for(el =>
        {
            $$.from(el.attributes).for(i => $$(el).dvar(i.name));
            el.parentNode.removeChild(el);
        });
        return $$;
    }

    $$.all = function(from, attempt)
    {
        $$.style();
        var from = (typeof from === "undefined") ? "" : (from + " ");
        var attempt = (typeof attempt === "undefined") ? 0 : attempt;
        from += " ";

        // $$.localScopes(); // Not necessary because it's covered in htmlvars
        $$.htmlvars(from);

        var arr = document.querySelectorAll(from + "component[make]");

        $$.from(arr).for(y =>
        {
            $$.components[y.getAttribute("type")] = [y.innerHTML, y.getAttribute("make"), (y.querySelector("bindings") ||
            {
                textContent: ""
            }).textContent];
            y.parentNode.removeChild(y);
        });

        arr = document.querySelectorAll(from + "component[from]");
        $$.from(arr).for(y =>
        {
            var type = y.getAttribute("type")
            var vars = $$.components[type][1].split(' ');
            var vars2 = y.getAttribute("from").split(' ');
            var t = $$.components[type][0];
            vars.forEach((i, x) =>
            {
                var reg = new RegExp("{{" + i + "}}", "g");
                t = t.replace(reg, "{{" + vars2[x] + "}}");
            });

            y.setAttribute("was-from", vars2.join(" "));
            y.removeAttribute("from");
            y.setAttribute("watch", "html");
            y.innerHTML = t;

            vars.forEach((i, x) =>
            {
                $$.from(y.querySelectorAll('[vname="' + i + '"]')).for(i =>
                {
                    i.setAttribute("bind", vars2[x]);
                });

                $$.from(y.querySelectorAll('bindings')).for(i => i.parentNode.removeChild(i));
            });
        });

        arr = document.querySelectorAll(from + "[watch]:not([watched])");
        $$.from(arr).for(y =>
        {
            var watched = y.getAttribute("watch").split(" ");
            $$.from(watched).for(i =>
            {
                $$.from(y).watch(i);
            });

            y.setAttribute("watched", y.getAttribute("watch").toLowerCase());
            y.removeAttribute("watch");
        });

        arr = document.querySelectorAll(from + '[bind]:not([bound])');
        $$.from(arr).for((y) =>
        {
            var bind = closest2(y, y.getAttribute("bind"));
            if (typeof $$.bindings[bind] === "undefined")
            {
                attempt++;
                if (attempt < 4)
                    setTimeout(() => $$.all(from, attempt), attempt * 200);
                return;
            }
            var oneWay = typeof y.attributes["one-way"] !== "undefined";
            var bindTo = (typeof y.attributes["bind-to"] === "undefined") ? (y instanceof HTMLInputElement ? (((typeof y.attributes["type"] === "object" && y.getAttribute("type") === "checkbox") ? "checked" : "value")) : y instanceof HTMLTextAreaElement ? "value" : "textContent") : y.getAttribute("bind-to");
            y.setAttribute("bound", bind);
            y.removeAttribute("bind");
            $$._bindElement(bind, y, bindTo, oneWay);
        });

        arr = document.querySelectorAll(from + BASYL_SCRIPT);
        $$.from(arr).for(y =>
        {
            eval(y.textContent);
            y.parentNode.removeChild(y);
        });

        arr = document.querySelectorAll(from + "[basyl-if]:not(basyl-if-watched)");
        $$.from(arr).for(y =>
        {
            var j;
            var bind = y.getAttribute("basyl-if");
            var lam = x => x;

            if ((j = bind.indexOf('|')) != -1)
            {
                lam = new Function(bind.substring(0, j), 'return ' + bind.substring(j + 1));
                bind = bind.substring(0, j);
            }

            var def = y.style.display;
            bind = closest2(y, bind);

            $$.bind(bind, () =>
            {
                if (lam($$.get(bind))) y.style.display = def;
                else y.style.display = "none";
            });

            if (lam($$.get(bind))) y.style.display = def;
            else y.style.display = "none";

            y.setAttribute("basyl-if-watched", bind);
            y.removeAttribute("basyl-if");
        });
    }
}

createBasylBinder($$);