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
    let forceUpdate = 0;

    // used to make duplicates or to simply
    // convert node lists to arrays
    function _toConsArray(nodeList)
    {
        let arr = []
        for(let i = 0; i < nodeList.length; i++) arr.push(nodeList[i])
        return arr
    }

    const LOCAL_BIND_ID = "local-bind";
    const BASYL_VARS = "vars";
    const BASYL_SCRIPT = "basyl-script";
    const BASYL_DVARS = "dvars";
    const BASYL_PVARS = "pvars";
    const BASYL_SVARS = "svars";
    const BASYL_PVAR_PREFIX = 'bb_';

    /**
     * Queues an update, delays previous attempts at an update.
     * This is currently not in use internally.
     * 
     * @param {*} name 
     * @param {*} time 
     */
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

    /**
     * Binds a variable to another variable, or a variable to a function.
     * @param {*} name 
     * @param {*} n 
     */
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

    /**
     * Erases a variable from existence.
     * @param {*} name 
     */
    $$.forget = function(name)
    {
        name = name.toLowerCase()
        delete $$.bindings[name];
        return $$;
    }

    let emptyFunction = () => {}

    /**
     * Binds a format to an element.
     * Used internally. Do not call directly.
     * 
     * @param {*} el 
     * @param {*} func 
     */
    function _bindElementFormat(el, func)
    {
        el.value = func(el.value);
        let prev = el.onchange || emptyFunction;
        el.onchange = e =>
        {
            e.target.value = func(e.target.value);
            prev(e);
            el.oninput && el.oninput(e);
        }
        return $$;
    }

    /**
     * Binds an element to a dvar, used internally.
     * Do not call directly. 
     * 
     * @param {*} name 
     * @param {*} el 
     * @param {*} attr 
     * @param {*} oneWay 
     */
    function _bindElementDVar(name, el, attr, oneWay)
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

            let updateMethod = function()
            {
                el[attr] = get()

                // Tells the code to delete this update function
                // if this element ceases to exist.
                if (!el.parentNode)
                {
                    let z = $$.bindings[name][2].indexOf(updateMethod);
                    $$.bindings[name][2].splice(z, 1);
                }
            }

            $$.bindings[name][2].push(updateMethod);
            el[attr] = get();
        }

        _bindElementFinal(name, el, attr, get, set)
    }

    /**
     * Binds an element to a normal variable. 
     * Used internally. Do not call directly. 
     * 
     * @param {*} name 
     * @param {*} el 
     * @param {*} attr 
     * @param {*} oneWay 
     */
    function _bindElementNormal(name, el, attr, oneWay)
    {
        if (!oneWay)
        {
            // If it isn't one way, update the current value and tell it to update this value
            $$.bindings[name][2].push([el, attr]);
            el[attr] = $$.bindings[name][0]();
        }

        _bindElementFinal(name, el, attr, () => $$.get(name), val => $$.set(name, val))
    }


    /**
     * Extracted for optimization purposes.
     * Updates from most types of inputs.
     * 
     * @param {*} e 
     * @param {*} name 
     * @param {*} el 
     * @param {*} attr 
     * @param {*} get 
     * @param {*} set 
     */
    function updateFromInput(e, name, el, attr, get, set)
    {
         // Garbage Collection
         if (typeof $$.bindings[name] === "undefined")
         {
             delete el.oninput;
             return;
         }

         // Used to prevent annoying field cursor resets.
         const allowed = ["text", "url", "password", "telephone", "search", ""]
         if (get() != e.target[attr])
         {
             if ((el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) && allowed.indexOf((el.getAttribute('type') || "").toLowerCase().trim()) !== -1)
             {
                 let s = el.selectionStart,
                     end = el.selectionEnd;

                 set(e.target[attr])

                 // Prevents annoying field cursor reset.
                 el.setSelectionRange(s, end);
             }
             else
             {
                 set(e.target[attr])    
             }
         }
    }

    /**
     * Used to update from other type of fields, like checkboxes 
     * and selects 
     * 
     * @param {*} e 
     * @param {*} name
     * @param {*} el 
     * @param {*} attr 
     * @param {*} get 
     * @param {*} set 
     */
    function updateFromOther(e, name, el, attr, get, set)
    {
        // Garbage Collection
        if (typeof $$.bindings[name] === "undefined")
        {
            delete el.oninput;
            return;
        }

        // If the current value is not the same as the new one
        if (get() != e.target[attr])
        {
            // Because it's a checkbox, check if there's an on-true value it should be set to
            if (el.hasAttribute("on-true") && e.target[attr] == true)
            {
                set(el.getAttribute("on-true"))
            }
            // or an on-false
            else if (el.hasAttribute("on-false") && e.target[attr] == false)
            {
                set(el.getAttribute("on-false"))
            }
            // otherwise just use the actual value
            else
            {
                set(e.target[attr])
            }
        }
    }



    /**
     * Final step in binding an element to a variable.
     * Used internally.
     * 
     * @param {*} name 
     * @param {*} el 
     * @param {*} attr 
     * @param {*} get 
     * @param {*} set 
     */
    function _bindElementFinal(name, el, attr, get, set)
    {
        // If it's some sort of editable field
        // There's a small bug here I'll fix later, I need to actually check if the content-editable field is set to true.
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.hasAttribute("contenteditable") || el instanceof HTMLSelectElement)
        {
            // If it's a checkbox or a file or select
            if (el.attributes["type"] && (el.getAttribute("type") === "checkbox" || el.getAttribute("type") === "file") || el instanceof HTMLSelectElement)
            {
                el.onchange = (e) => updateFromOther(e, name, el, attr, get, set)                
            }
            else
            {
                // Good for most types of input...
                el.oninput = e => updateFromInput(e, name, el, attr, get, set)
            }
        }

    }

    /**
     * First step in binding an element to a variable. 
     * Used internally.
     *  
     * @param {*} name 
     * @param {*} el 
     * @param {*} attr 
     * @param {*} oneWay 
     */
    function _bindElement(name, el, attr, oneWay)
    {
        oneWay = (typeof oneWay === "undefined") ? false : oneWay;
        name = closest2(el, name);

        // Checks if the binding exists, and the element we're binding to exists.
        if (typeof $$.bindings[name] !== "undefined" && typeof el !== "undefined")
        {

            // This code is for d-vars, and needs major refactoring.
            if ($$.bindings[name].length == 4 && $$.bindings[name][3] == "Array")
            {
                _bindElementDVar(name, el, attr, oneWay)
            }
            else
            {
                _bindElementNormal(name, el, attr, oneWay)
            }

        }
        return $$;
    }

    /**
     * Creates a 'variable' you can access from the provided getters and setters.
     * 
     * @param {*} name 
     * @param {*} getter 
     * @param {*} setter 
     */
    $$.create = function(name, getter, setter)
    {
        name = name.toLowerCase()
        getter = getter || emptyFunction;
        setter = setter || emptyFunction;
        $$.bindUpdates[name] = false;
        $$.bindings[name] = [getter, setter, []];
        return $$;
    }

    /**
     * Creates a 'view' of a variable, which is basically a transformation of the source variable.
     * 
     * It will automatically bind the first variable to the second.
     * 
     * @param {String} name 
     * @param {String} formattedName 
     * @param {Function} mutator 
     */
    $$.createView = function(name, formattedName, mutator)
    {
        name = name.toLowerCase(), formattedName = formattedName.toLowerCase()
        if (typeof $$.bindings[name] === "undefined") htmlvars(' ');
        $$.create(formattedName, () => mutator($$.get(name)));
        $$.bind(name, formattedName);
        return $$;
    }
    
    /**
     * Updates a variable.
     * @param {String} name 
     */
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
                    x($$.get(name));
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

    /**
     * Gets a dynamic variable.
     * @param {*} name 
     */
    $$.dget = function(name)
    {
        name = name.toLowerCase()
        if (typeof $$.bindings[name] !== "undefined")
        {
            return $$.get(name).arr;
        }
    }

    /**
     * Gets a variable.
     * @param {*} name 
     */
    $$.get = function(name)
    {
        name = name.toLowerCase()
        if (typeof $$.bindings[name] !== "undefined")
        {
            return $$.bindings[name][0]();
        }
    }

    /**
     * Sets a variable
     * @param {*} name 
     * @param {*} v 
     */
    $$.set = function(name, v)
    {
        name = name.toLowerCase();
        if (typeof $$.bindings[name] !== "undefined")
        {
            if ($$.bindUpdates[name]) return;
            
            // Checks if the setter exists
            if($$.bindings[name][1])
            {                
                $$.bindings[name][1](v);
                $$.update(name);    
            }
        }
        return $$;
    }
    
    // shim for slightly older browsers
    if (!Element.prototype.matches) {
        Element.prototype.matches = Element.prototype.msMatchesSelector;
    }

    function _fromId(x)
    {
        return $$.from(document.getElementById(x));
    }

    /**
     * Used internally to find the closest variable match.
     * @param {*} el 
     * @param {*} key 
     */
    function closest2(el, key)
    {
        key = key.toLowerCase();
        let y;
        if (y = $$.closest(el, key))
        {
            return y.getAttribute(LOCAL_BIND_ID).toLowerCase() + ':' + key;
        }

        if (typeof $$.bindings[key] !== "undefined")
            return key;

        return null;
    }

    /**
     * Finds the closest local-bind.
     * @param {*} el 
     * @param {*} key 
     * @param {*} selector 
     */
    $$.closest = function(el, key, selector)
    {
        selector = (typeof selector === "undefined") ? "[" + LOCAL_BIND_ID + "]" : selector;
        let retval = null;
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

    $$._randStr = () => Math.random().toString(36).substring(2)

    function _fromInput(x)
    {
        let result = {}

        result.bind = function(name, oneWay)
        {
            _bindElement(name, x, "value", oneWay);
            return result;
        }

        result.format = function(func)
        {
            _bindElementFormat(x, func);
            return result;
        }

        return result;
    }

    function htmlDecode(input)
    {
        let doc = new DOMParser().parseFromString(input, "text/html");
        return doc.documentElement.textContent;
    }

    function _fromElement(x)
    {
        let result = {}

        result.bind = function(name, attr, oneWay)
        {
            _bindElement(name, x, attr, oneWay);
            return result;
        }

        return result;
    }

    $$.from = function(x)
    {
        if (typeof x === "string")
        {
            let sub = x.substring(1)

            if (x.indexOf("#") === 0) 
            {
                return _fromId(sub);
            }

            if (x.indexOf("*") === 0)
            {
                return $$.from(document.querySelectorAll(sub));
            }

            if (x.indexOf("$") === 0) 
            {
                return $$.from(document.querySelector(sub));
            }
        }

        let result;

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
                result = _fromInput(x);
            }
            else result = _fromElement(x);

            
            /**
             * Used to create the local-bind variants of each of the
             * variable creation types.
             * 
             * @param {*} func 
             */
            function localBindVariant(func)
            {
                return function()
                {
                    let y;
                
                    if (y = $$.closest(x))
                    {
                        y = y.getAttribute(LOCAL_BIND_ID);
                        let a = _toConsArray(arguments)
                        a[0] = y + ':' + a[0]                        
                        return func.apply(null, a);
                    }

                    func.apply(null, arguments)
                    return result
                }
            }

            result.var = localBindVariant($$.var)
            result.const = localBindVariant($$.const)
            result.dvar = localBindVariant($$.dvar)
            result.bind = localBindVariant($$.bind)

            // This is a mess and needs documentation.
            result.watch = function(name)
            {
                let orig = name
                let optimize = false
                let prop = false

                // creates bindings to html / text 
                if (name == "html" || name == "text") 
                { 
                    name = "innerHTML";
                    prop = optimize = true
                } 
                
                // specifies that it is a property and not an attribute
                // and also tells it to attempt to optimize it
                if (name.charAt(0) == "*")
                {
                    name = name.substring(1)
                    prop = optimize = true 
                }

                // if innerHTML, but a style/script, disable optimization. It doesn't always turn out correctly.
                if(name === "innerHTML")
                {
                    if (x instanceof HTMLStyleElement || x instanceof HTMLScriptElement) 
                    {
                        optimize = false
                    }
                }  
                

                // The string of data that needs to get parsed
                let str;
                
                if (prop) 
                { 
                    // grabs the property from the element
                    str = x[name]; 
                }
                else 
                {
                    // grabs the attribute from the element
                    str = x.getAttribute(name) || "";
                }

                // extracts the values and their lambdas (if they exist)
                let vals = (str.toString().match(/\{\{[A-Za-z0-9\-_#]+(\|[^}]+(\}[^}]+)?)*\}\}/g) || []).map(i =>
                {
                    let valsThenLambdas = i.substring(2, i.length - 2).split("|")
                    let val = valsThenLambdas[0];
                    valsThenLambdas[0] = "";
                    return [val.toLowerCase(), valsThenLambdas.join("|").substring(1), escapeRegExp(i)];
                });

                
                // removes duplicates
                vals = vals.filter(v => closest2(x, v[0])).filter(onlyUnique);

                // creates the regular expressions
                let regExpressions = vals.map(i => new RegExp(i[2], "g"));

                let func = () =>
                {
                    let data = str.toString();
                    if (optimize)
                    {
                        $$.from(x.childNodes).for((it, i) =>
                        {
                            if (it instanceof HTMLElement)
                            {
                                // iterate over each of the internal elements to replace values and create bindings
                                $$.from(it).watch(orig);

                                // iterate over each of the attributes to replace values and create bindings
                                $$.from(it.attributes).for(i =>
                                {
                                    if (regExpressions.some(k => i.value.match(k))) $$.from(it).watch(i.name);
                                })
                            }
                            else if (it instanceof Text)
                            {
                                data = it.data;

                                if (data.trim() !== "")
                                {
                                    regExpressions.forEach((j, i) =>
                                    {
                                        // finds the closest binding (if in a localScope)
                                        let bound = closest2(x, vals[i][0]);

                                        // Generates random string bindings for the lambdas, to make it easier.
                                        if (vals[i][1] !== "")
                                        {
                                            // generates a bound name
                                            bound = $$._randStr() + $$._randStr();

                                            // creates the binding for the lambda
                                            $$.createView(vals[i][0], bound, new Function(vals[i][0], "return " + htmlDecode(vals[i][1])));
                                        }
                                        
                                        // sets the binding type (html vs text)
                                        let bindType = (orig == "*innerHTML" || orig == "html") ? 'bind-to="innerHTML"' : '';
                                        
                                        // add a bound element to the html
                                        data = data.replace(j, '<v bind="' + bound + '"' + bindType + '></v>');
                                    })

                                    // insert the bound elements
                                    it.parentNode.replaceChild(new DOMParser().parseFromString("<v>" + data + "</v>", "text/html").childNodes[0].childNodes[1].childNodes[0], it);
                                }
                            }
                        });
                    }
                    else
                    {
                        // If un-optimized, it just updates the entire attribute by replacing parts of the string
                        regExpressions.forEach((j, i) =>
                        {
                            // if there is lambda code, 
                            if (vals[i][1] !== "")
                            {
                                // create the lambda
                                let lam = new Function(vals[i][0], "return " + vals[i][1]);
                                
                                // replace the bound variables with the data (after parsing it with the lambda)
                                data = data.replace(j, lam($$(x).get(vals[i][0])));
                            }
                            else
                            {
                                // replace the bound variables                                
                                data = data.replace(j, $$(x).get(vals[i][0]));
                            }
                        })

                        if (prop)
                        {
                            x[name] = data;                        
                        }
                        else
                        {
                            x.setAttribute(name, data);                        
                        }
                    }

                       
                    
                }


                // for the non-optimized values, create the binding function 
                vals.forEach(i =>
                {
                    if (!optimize)
                        $$.bind(closest2(x, i[0]), func);
                })

                func();
            }

            result.get = function(z)
            {
                return $$.get(closest2(x, z));
            }

            result.set = function(z, v)
            {
                $$.set(closest2(x, z), v);
                return result
            }

            return result;
        }

        result = {}

        if (Array.isArray(x))
        {
            result.do = func => x.map(func);
            result.for = func => x.forEach(func);
        }
        else
        {
            // similar to a forEach function
            result.for = func =>
            {
                for (let i = 0; i < x.length; i++)
                {
                    func(x[i], i);
                }
            }

            // similar to a map function
            result.do = func =>
            {
                let result = [];
                for (let i = 0; i < x.length; i++)
                {
                    result.push(func(x[i], i));
                }
                return result;
            }
        }

        // filters the data structure internally
        result.filter = func =>
        {
            // converts to an array if necessary
            result._arrayFix()
            
            for(let i = 0; i < x.length; i++)
            {
                // if it doesn't test true, remove it from the array
                if(!func(x[i]))
                {
                    x.splice(i, 1)
                }
            }

            return result
        }

        // gives the underlying variable we're processing
        result.release = () => x

        // converts node lists and similar iterable structures to an array
        result.toArray = () => x = _toConsArray(x)

        // a check and then an execution of the conversion
        result._arrayFix = () => !Array.isArray(x) && result.toArray()

        // transforms the data internally
        result.transform = func =>
        {
            result._arrayFix()

            for(let i = 0; i < x.length; i++)
            {
                x[i] = func(x[i], i)
            }

            return result
        }

        // transposes a matrix
        result.transpose = () =>
        {
            let transpose = (y, i) => x[i].map((y, i) => x.map(y => y[i]))
            let cur = result.max()[0];
            return transpose(x, cur);
        }

        result.max = () =>
        {
            let max = 0,
                cur = 0;
            for (let i = 0; i < x.length; i++)
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
            result._arrayFix()
            return x.concat([0]).reduce((val, sum) => (parseFloat(sum) + parseFloat(val)) || 0)
        }

        result.ffor = (y, z) =>
        {
            for (let i = 0; i < x.length; i++)
            {
                z(x[i]) && y(x[i], i);
            }
        }

        result.table = function(options)
        {
            if(!options) options = {}
            if (typeof options.fill === "undefined") options.fill = "";
            if (typeof options.head === "undefined") options.head = [];
            let max = result.max()[1];

            // Used to wrap the elements. with <> and </>
            function wrap(x, el)
            {
                return "<" + el + ">" +  x + "</" + el + ">"
            }

            for (let i = 0; i < x.length; i++)
            {
                while (x[i].length < max) x[i].push("");
            }

            let tbody = wrap(x.map(i=>wrap(i.map(j =>wrap(j || options.fill, "td")).join(""), "tr")).join(""), "tbody");
            let thead = "";

            if (options.head.length)
            {
                thead = wrap(wrap(options.head.map(i=>wrap(i, "th")).join(''), "tr"), "thead");
            }

            return wrap(thead + tbody, "table");
        }

        result.fdo = (y, z) =>
        {
            let result = [];
            for (let i = 0; i < x.length; i++)
            {
                let item = z(x[i]) ? y(x[i], i) : null;
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
            let x = parseInt(v.val)
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
        let obj = {}
        obj.val = v ? v : "";
        let get = g ? g : $$.templates.getAny;
        let set = s ? s : $$.templates.setAny;
        obj.set = v => set(obj, v);
        obj.get = () => get(obj);
        return obj;
    }

    $$.dvar = function(name)
    {
        name = name.toLowerCase();
        let obj = {
            arr: []
        }
        let set = (obj, v, i) => obj.arr[i] = v;
        let get = (obj, i) => obj.arr[i];
        obj.set = (v, i) => set(obj, v, i);
        obj.get = i => get(obj, i);
        obj.count = () => obj.arr.length;
        $$.create(name, () => obj);
        $$.bindings[name].push("Array");
        return $$;
    }

    $$.search = function(name)
    {
        return Object.keys($$.bindings).filter(i => i.match(name));
    }

    // This will be fleshed out later on.
    // This will allow you to specify constant variables that won't change.
    // This will prevent bindings from being a big deal
    $$.const = function(name, v)
    {
        return $$.create(name, () => v);
    }

    // Persisted variable - These will only work in the global scope.
    $$.pvar = function(name, v, g, s)
    {
        const index = BASYL_PVAR_PREFIX + name;

        if(!localStorage[index])
            localStorage[index] = v

        let set = val =>
        {
            localStorage[index] = val
        }

        let get = () =>
        {
            return localStorage[index]
        }

        $$.create(name, get, set)
        
        return $$
    }

    $$.var = function(name, v, g, s)
    {
        let a = new $$._CV(v, g, s);
        $$.create(name, a.get, a.set);
        return $$;
    }

    $$.range = function(x, y)
    {
        return _toConsArray(Array(y - x + 1).keys()).map(i => i + x);
    }

    /**
     * Creates local-binds, which encapsulate the variables within a section of the document.
     * 
     * @param {*} from 
     */
    function localScopes(from)
    {
        $$.from('*' + from + "[" + LOCAL_BIND_ID + "]").for(i =>
        {
            if (i.getAttribute(LOCAL_BIND_ID) === "")
            {
                i.setAttribute(LOCAL_BIND_ID, $$._randStr());
            }
        });
    }

    /**
     * Creates bindings to stylesheets
     */
    function style(from)
    {        
        $$.from('*' + from + 'basyl-style,script[type="basyl-style"]').for(i =>
        {
            let a = document.createElement("style");
            a.innerHTML = i.innerHTML;
            i.parentNode.replaceChild(a, i);
            $$.from(a).watch("-html");
        });
    }

    /**
     * Creates bb variables from the HTML
     * @param {*} from 
     */
    function htmlvars(from)
    {
        localScopes(from);

        function varSetup(type, func)
        {
            $$.from('*' + from + type).for(el =>
            {
                $$.from(el.attributes).for(i => $$.from(el)[func](i.name, i.value));
                el.parentNode.removeChild(el)
            })
        }
        
        varSetup(BASYL_VARS, 'var')
        varSetup(BASYL_SVARS, 'const')
        varSetup(BASYL_DVARS, 'dvar')        

        $$.from('*' + from + BASYL_PVARS).for(el =>
        {
            // pvars have global scope by design.
            $$.from(el.attributes).for(i=>$$.pvar(i.name, i.value));
            el.parentNode.removeChild(el);
        });
       
        return $$;
    }

    /**
     * Declares the component templates.
     * @param {*} from 
     */
    function componentInit(from)
    {
        $$.from('*' + from + "component[make]").for(y =>
        {
            $$.components[y.getAttribute("type")] = [y.innerHTML];
            y.parentNode.removeChild(y);
        });
    }


    /**
     * Creates the component templates.
     * Should be executed from "all"
     * @param {*} from 
     */
    function componentMake(from)
    {
        $$.from('*' + from + "component[from]").for(y =>
        {
            let type = y.getAttribute("type")
        
            y.setAttribute("was-from", true);
            y.removeAttribute("from");
            y.setAttribute("watch", "html");
            
            let extraVars = y.querySelectorAll(BASYL_VARS + "," + BASYL_SVARS)
            
            y.innerHTML = $$.components[type][0];
            $$.from(extraVars).for(i=>y.appendChild(i))
            
            if(extraVars.length) y.setAttribute('local-bind', '')
        })
    }

    function fromFix(from)
    {
        return (typeof from === "undefined") ? "" : (from + " ")
    }

    function basylIf(from)
    {
        $$.from('*' + from + "[basyl-if]:not(basyl-if-watched)").for(y =>
        {
            let j;
            let bind = y.getAttribute("basyl-if");
            let lam = x => x;

            if ((j = bind.indexOf('|')) != -1)
            {
                lam = new Function(bind.substring(0, j), 'return ' + bind.substring(j + 1));
                bind = bind.substring(0, j);
            }

            let def = y.style.display;
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

    function basylScript(from)
    {
        $$.from('*' + from + BASYL_SCRIPT).for(y =>
        {
            eval(y.textContent);
            y.parentNode.removeChild(y);
        });
    }

    function basylWatch(from)
    {        
        $$.from('*' + from + "[watch]:not([watched])").for(y =>
        {
            let watched = y.getAttribute("watch").split(" ");
            $$.from(watched).for(i =>
            {
                $$.from(y).watch(i);
            });

            y.setAttribute("watched", y.getAttribute("watch").toLowerCase());
            y.removeAttribute("watch");
        })
    }

    function basylBind(from, attempt)
    {        
        attempt = (typeof attempt === "undefined") ? 0 : attempt;        
        
        $$.from('*' + from + '[bind]:not([bound])').for((y) =>
        {
            let bind = closest2(y, y.getAttribute("bind"));
            if (typeof $$.bindings[bind] === "undefined")
            {
                attempt++;
                if (attempt < 4)
                    setTimeout(() => $$.basylBind(from, attempt), attempt * 200);
                return;
            }

            let oneWay = typeof y.attributes["one-way"] !== "undefined";
            
            let bindTo
            
            // Create the default bind to for each of the elements
            if(typeof y.attributes["bind-to"] === "undefined")
            {
                if(y instanceof HTMLInputElement)
                {
                    if (typeof y.attributes["type"] === "object" && y.getAttribute("type") === "checkbox")
                    {
                        bindTo = "checked"
                    }
                    else
                    {
                        bindTo = "value"
                    }
                } 
                else if (y instanceof HTMLTextAreaElement || y instanceof HTMLSelectElement)
                {
                    bindTo = "value"
                }
                else
                {
                    bindTo = "textContent"
                } 
            }
            else
            {
                bindTo = y.getAttribute("bind-to")
            }
            
            y.setAttribute("bound", bind);
            y.removeAttribute("bind");
            _bindElement(bind, y, bindTo, oneWay);
        });

    }

    /**
     * The main function that should be used with BasylBinder.
     * Executes the bind operations in the correct order. (usually)
     * 
     * @param {*} from 
     */
    $$.all = function(from)
    {
        from = fromFix(from)
        
        style(from)

        // Component Code
        componentInit(from)
        componentMake(from)

        htmlvars(from)

        basylWatch(from)
        basylBind(from)
        basylScript(from)
        basylIf(from)
    }
}

createBasylBinder($$);