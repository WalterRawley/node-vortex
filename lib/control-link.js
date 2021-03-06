
/*

  PrismTech licenses this file to You under the Apache License, Version 2.0
  (the "License"); you may not use this file except in compliance with the
  License and with the PrismTech Vortex product. You may obtain a copy of the
  License at

  http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
  WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
  License and README for the specific language governing permissions and
  limitations under the License.
 */

(function() {
  var Config, ControlLink, ControlLinkWorker, CreateDataReaderMsg, CreateDataWriterMsg, CreateTopicMsg, DataReaderInfo, DataWriterInfo, EventEmitter, Header, TopicInfo, WebSocket, dds, drt, root, util, z_;

  EventEmitter = require('events');

  util = require('util');

  WebSocket = require('ws');

  z_ = require('./coffez.js');

  drt = require('./control-commands.js');

  dds = require('./dds.js');

  Config = require('./config.js');


  /*
    Wire  Protocol Messages
   */

  root = {};

  Header = function(c, k, s) {
    return {
      cid: c,
      ek: k,
      sn: s
    };
  };

  TopicInfo = function(topic) {
    return {
      did: topic.did,
      tn: topic.tname,
      tt: topic.ttype,
      trt: topic.tregtype,
      qos: topic.qos.policies
    };
  };

  DataReaderInfo = function(topic, qos) {
    return {
      did: topic.did,
      tn: topic.tname,
      qos: qos.policies
    };
  };

  DataWriterInfo = DataReaderInfo;

  CreateTopicMsg = function(seqn, topic) {
    return {
      h: Header(drt.CommandId.Create, drt.EntityKind.Topic, seqn),
      b: TopicInfo(topic)
    };
  };

  CreateDataReaderMsg = function(seqn, topic, qos) {
    return {
      h: Header(drt.CommandId.Create, drt.EntityKind.DataReader, seqn),
      b: DataReaderInfo(topic, qos)
    };
  };

  CreateDataWriterMsg = function(seqn, topic, qos) {
    return {
      h: Header(drt.CommandId.Create, drt.EntityKind.DataWriter, seqn),
      b: DataWriterInfo(topic, qos)
    };
  };

  ControlLink = (function() {
    function ControlLink() {
      EventEmitter.call(this);
      this.connected = false;
      this.closed = false;
      this.socket = z_.None;
      this.ctrlSock = z_.None;
      this.server = "";
      this.authToken = "";
      this.sn = 0;
      this.drmap = {};
      this.dwmap = {};
      this.tmap = {};
    }

    util.inherits(ControlLink, EventEmitter);

    ControlLink.prototype.connect = function(url, atoken) {
      var endpoint, pendingCtrlSock, webSocket;
      if (this.connected === false) {
        this.server = url;
        this.authToken = atoken;
        endpoint = Config.runtime.controllerURL(this.server) + '/' + this.authToken;
        console.log("[control-link] Connecting to: " + endpoint);
        this.ctrlSock = z_.None;
        webSocket = new WebSocket(endpoint);
        pendingCtrlSock = z_.Some(webSocket);
        pendingCtrlSock.map(((function(_this) {
          return function(s) {
            return s.on('open', function() {
              var evt;
              console.log('[control-link] Connected to: ' + _this.server);
              _this.ctrlSock = pendingCtrlSock;
              _this.connected = true;
              evt = drt.OnConnectedRuntime(_this.server);
              return _this.emit('postMessage', evt);
            });
          };
        })(this)));
        pendingCtrlSock.map(((function(_this) {
          return function(s) {
            return s.on('close', function(evt) {
              console.log("[control-link] The  " + _this.server + " seems to have dropped the connection.");
              _this.connected = false;
              _this.closed = true;
              _this.ctrlSock = z_.None;
              return _this.emit('postMessage', drt.OnDisconnectedRuntime(_this.server));
            });
          };
        })(this)));
        return pendingCtrlSock.map(((function(_this) {
          return function(s) {
            return s.on('message', function(msg) {
              return _this.handleMessage(msg);
            });
          };
        })(this)));
      } else {
        return console.log("[control-link] Warning: Trying to connect an already connected Runtime");
      }
    };

    ControlLink.prototype.close = function() {
      if (!this.closed) {
        this.closed = true;
        return this.disconnect();
      }
    };

    ControlLink.prototype.disconnect = function() {
      if (this.connected) {
        this.connected = false;
        this.ctrlSock.map(function(s) {
          console.log("[control-link] closing socket");
          return s.close();
        });
        return this.crtSock = z_._None;
      }
    };

    ControlLink.prototype.createTopic = function(topic, qos, eid) {
      var cmd, scmd;
      console.log("[control-link] Creating Topic for eid = " + eid);
      cmd = CreateTopicMsg(this.sn, topic);
      this.tmap[this.sn] = eid;
      this.sn = this.sn + 1;
      scmd = JSON.stringify(cmd);
      return this.ctrlSock.map(function(s) {
        return s.send(scmd);
      });
    };

    ControlLink.prototype.createDataReader = function(topic, qos, eid) {
      var cmd, scmd;
      cmd = CreateDataReaderMsg(this.sn, topic, qos);
      this.drmap[this.sn] = eid;
      this.sn = this.sn + 1;
      scmd = JSON.stringify(cmd);
      return this.ctrlSock.map(function(s) {
        return s.send(scmd);
      });
    };

    ControlLink.prototype.createDataWriter = function(topic, qos, eid) {
      var cmd, scmd;
      cmd = CreateDataWriterMsg(this.sn, topic, qos);
      this.dwmap[this.sn] = eid;
      this.sn = this.sn + 1;
      scmd = JSON.stringify(cmd);
      return this.ctrlSock.map(function(s) {
        return s.send(scmd);
      });
    };

    ControlLink.prototype.handleMessage = function(s) {
      var evt, guid, msg, url;
      console.log("[control-link] CtrlWorker Received message from server:" + s);
      msg = JSON.parse(s);
      switch (false) {
        case !z_.match(msg.h, {
            cid: drt.CommandId.OK,
            ek: drt.EntityKind.DataReader
          }):
          guid = msg.b.eid;
          url = Config.runtime.readerPrefixURL(this.server) + '/' + guid;
          console.log("[control-link] sn = " + msg.h.sn + ", eid = " + this.drmap[msg.h.sn]);
          evt = drt.OnCreatedDataReader(url, this.drmap[msg.h.sn]);
          delete this.drmap[msg.h.sn];
          return this.emit('postMessage', evt);
        case !z_.match(msg.h, {
            cid: drt.CommandId.OK,
            ek: drt.EntityKind.DataWriter
          }):
          guid = msg.b.eid;
          url = Config.runtime.writerPrefixURL(this.server) + '/' + guid;
          console.log("[control-link] sn = " + msg.h.sn + ", eid = " + this.dwmap[msg.h.sn]);
          evt = drt.OnCreatedDataWriter(url, this.dwmap[msg.h.sn]);
          delete this.dwmap[msg.h.sn];
          return this.emit('postMessage', evt);
        case !z_.match(msg.h, {
            cid: drt.CommandId.OK,
            ek: drt.EntityKind.Topic
          }):
          console.log("[control-link] Topic sn = " + msg.h.sn + "  eid = " + this.tmap[msg.h.sn]);
          evt = drt.OnCreatedTopic(this.tmap[msg.h.sn]);
          delete this.tmap[msg.h.sn];
          return this.emit('postMessage', evt);
        case !z_.match(msg.h, {
            cid: drt.CommandId.Error,
            ek: void 0
          }):
          evt = drt.OnError(msg.h.ek, msg.b.msg);
          return this.emit('postMessage', evt);
        default:
          return console.log("[control-link] ControlLink received invalid message from server");
      }
    };

    return ControlLink;

  })();

  ControlLinkWorker = (function() {
    function ControlLinkWorker() {
      var worker;
      EventEmitter.call(this);
      worker = this;
      this.ctrlLink = new ControlLink();
      this.ctrlLink.on('postMessage', function(evt) {
        return worker.emit('postMessage', evt);
      });
    }

    util.inherits(ControlLinkWorker, EventEmitter);

    ControlLinkWorker.prototype.postMessage = function(cmd) {
      console.log("[control-link] CtrlWorker received cmd: " + JSON.stringify(cmd));
      switch (false) {
        case !z_.match(cmd.h, drt.ConnectCmd):
          console.log("[control-link]: cmd = Connect (" + cmd.url + ")");
          return this.ctrlLink.connect(cmd.url, cmd.authToken);
        case !z_.match(cmd.h, drt.CreateTopicCmd):
          return this.ctrlLink.createTopic(cmd.topic, cmd.qos, cmd.eid);
        case !z_.match(cmd.h, drt.CreateDataReaderCmd):
          console.log("[control-link] CreateDataReader: " + cmd.eid);
          return this.ctrlLink.createDataReader(cmd.topic, cmd.qos, cmd.eid);
        case !z_.match(cmd.h, drt.CreateDataWriterCmd):
          console.log("[control-link] CreateDataWriter: " + cmd.eid);
          return this.ctrlLink.createDataWriter(cmd.topic, cmd.qos, cmd.eid);
        case !z_.match(cmd.h, drt.Disconnect):
          return this.ctrlLink.disconnect();
        default:
          return console.log("[control-link] Worker Received Unknown Command!");
      }
    };

    return ControlLinkWorker;

  })();

  module.exports = ControlLinkWorker;

}).call(this);
