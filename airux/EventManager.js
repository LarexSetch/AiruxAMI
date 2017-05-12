/**
 * Created by 1 on 22.02.2017.
 */

if (typeof uniqid == "undefined") {
	var uniqid = require("uniqid");
}
var guid = 0;
/**
 * Создает менеджер событий с таргетом по умолчанию
 * Таргет это контекст (this) в котором вызывается событие.
 * По умолчанию занчение контекста это объект менеджера события
 *
 * @param defaultTarget
 * @constructor
 */

module.exports = function (defaultTarget) {
	//this.stop = false;
	var self = this;
	var removedId = [];
	/**
	 * Объект с обработчиками событий
	 * @type {{}}
	 */
	this.events = {};

	if (typeof defaultTarget == 'undefined') {
		this.target = this;
	}

	/**
	 * Проверяет наличие обработчиков события eventName
	 *
	 * @param eventName
	 * @returns {boolean}
	 */
	this.hasHandlers = function (eventName) {
		if (typeof this.events[eventName] == "undefined") {
			return false;
		} else if (this.events[eventName].length == 0) {
			return false;
		}
		return true;
	};

	/**
	 * Выводит информацию о событиях eventName и лог пишет категорию category
	 * @param eventName
	 * @param category
	 */
	this.debug = function (eventName, category) {
		if (typeof category == "undefined") {
			category = 'EventManager.debug';
		}
		if (typeof this.events[eventName] == "undefined") {
			Airux.log.info('Airux.api.lib.' + category, 'Нет событий событий c именем \'' + eventName + '\'');
			return;
		}
		for (var i = 0; i < this.events[eventName].length; i++) {
			Airux.log.beginGroup('Airux.api.lib.Event[' + eventName + '][' + i + '](target, handler, afterReadingDestroy)', this.events[eventName][i]['target'], this.events[eventName][i]['handler'], this.events[eventName][i]['afterReadingDestroy']);
		}
	};

	/**
	 * Помещает обработчик события в начало очереди выполнения событий.
	 *
	 * @param eventName
	 * @param handler
	 * @param target
	 * @returns {Airux.api.lib.EventManager}
	 */
	this.attachFirst = function (eventName, handler, target) {
		var eventItem;
		if (typeof eventName == 'undefined' || typeof handler == 'undefined') {
			throw "You must enter event name and handler";
		}
		if (!handler.guid) {
			handler.guid = uniqid("event_");
		}
		if (typeof target == 'undefined' || target == null) {
			target = this.target;
		}
		eventItem = {
			'handler': handler,
			'target': target
		};
		if (typeof this.events[eventName] == 'undefined') {
			this.events[eventName] = [];
		}
		this.events[eventName].unshift(eventItem);
		return this;
	};

	/**
	 * Добавляет обработчик события eventName, обработчиком handler и контекстом (this) target
	 * Если target не указан то используется контекст по умолчанию (указывается при создании)
	 * Обработчик добавляется в конец списка событий
	 *
	 * @param eventName
	 * @param handler
	 * @param target
	 * @returns {Airux.api.lib.EventManager}
	 */
	this.attach = function (eventName, handler, target) {
		var eventItem;
		if (typeof eventName == 'undefined' || typeof handler == 'undefined') {
			throw "You must enter event name and handler";
		}
		if (Array.isArray(eventName)) {
			for (var i = 0; i < eventName.length; i++) {
				this.attach(eventName[i], handler, target);
			}
			return this;
		}
		if (!handler.guid) {
			handler.guid = uniqid("event_");
		}
		if (typeof afterReadingDestroy != "undefined") {
			console.trace(afterReadingDestroy);
			Airux.log.warn("Airux.api.lib.EventManager.trigger", "After reading destroy is not supported!");
		}
		if (typeof target == 'undefined' || target == null) {
			target = this.target;
		}
		eventItem = {
			'handler': handler,
			'target': target
		};
		if (typeof this.events[eventName] == 'undefined') {
			this.events[eventName] = [];
		}
		this.events[eventName].push(eventItem);
		return this;
	};
	/**
	 * Альтернативное короткое написание метода attach
	 *
	 * @param eventName
	 * @param handler
	 * @param target
	 */
	this.on = function (eventName, handler, target) {
		this.attach(eventName, handler, target);
	};

	/**
	 * Удаляет обработчик в события eventName и обработчиком handler
	 *
	 * @param eventName
	 * @param handler
	 * @returns {null}
	 */
	this.remove = function (eventName, handler) {
		if (!this.events.hasOwnProperty(eventName)) {
			return null;
		}
		for (var i = 0; i < this.events[eventName].length; i++) {
			if (handler.guid == this.events[eventName][i].handler.guid) {
				this.events[eventName].splice(i--, 1);
				removedId.push(handler.guid);
			}
		}
	};

	/**
	 * Вызывает событие eventName с аргументами args и контектстом target
	 *
	 * @param eventName
	 * @param args
	 * @param target
	 * @returns {null}
	 */
	this.trigger = function (eventName, args, target) {
		if (!this.events.hasOwnProperty(eventName)) {
			return null;
		}
		if (typeof args == "undefined") {
			args = [];
		}
		var evt, triggerEvents = self.events[eventName].slice(0);
		var getEvent = function () {
			return triggerEvents.shift();
		};
		while (evt = getEvent()) {
			if (removedId.indexOf(evt.guid) != -1) {
				continue;
			}
			if (typeof target == 'undefined') {
				target = evt.target;
			}
			evt.handler.apply(target, args);
		}
		removedId = [];
		return null;
	};

	/**
	 * Очищает все обработички собятия eventName
	 *
	 * @param eventName
	 */
	this.clearEvent = function (eventName) {
		this.events[eventName] = [];
	};

	/**
	 * Очищает все обработичики
	 */
	this.clearAll = function () {
		for (var eventName in this.events) {
			if (this.events.hasOwnProperty(eventName)) {
				this.clearEvent(eventName);
			}
		}
	};
};