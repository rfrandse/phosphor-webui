/**
 * Controller for date-time
 *
 * @module app/configuration
 * @exports dateTimeController
 * @name dateTimeController
 */

window.angular && (function(angular) {
  'use strict';

  angular.module('app.configuration').controller('dateTimeController', [
    '$scope', '$window', 'APIUtils', '$route', '$q',
    function($scope, $window, APIUtils, $route, $q) {
      $scope.bmc = {};
      // Only used when the owner is "Split"
      $scope.host = {};
      $scope.ntp = {servers: []};
      $scope.time = {mode: '', owner: ''};
      // Possible time owners
      // https://github.com/openbmc/phosphor-dbus-interfaces/blob/master/xyz/openbmc_project/Time/Owner.interface.yaml#L13
      $scope.timeOwners = ['BMC', 'Host', 'Both', 'Split'];
      $scope.error = false;
      $scope.success = false;
      $scope.loading = true;
      var timePath = '/xyz/openbmc_project/time/';

      var getTimePromise = APIUtils.getTime().then(
          function(data) {
            // The time is returned as Epoch microseconds convert to
            // milliseconds.
            if (data.data[timePath + 'bmc'] &&
                data.data[timePath + 'bmc'].hasOwnProperty('Elapsed')) {
              $scope.bmc.date =
                  new Date(data.data[timePath + 'bmc'].Elapsed / 1000);
              // Don't care about milliseconds and don't want them displayed
              $scope.bmc.date.setMilliseconds(0);
              // https://stackoverflow.com/questions/1091372/getting-the-clients-timezone-in-javascript
              // GMT-0400 (EDT)
              $scope.bmc.timezone =
                  $scope.bmc.date.toString().match(/([A-Z]+[\+-][0-9]+.*)/)[1];
            }
            if (data.data[timePath + 'host'] &&
                data.data[timePath + 'host'].hasOwnProperty('Elapsed')) {
              $scope.host.date =
                  new Date(data.data[timePath + 'host'].Elapsed / 1000);
              $scope.host.date.setMilliseconds(0);
              $scope.host.timezone =
                  $scope.host.date.toString().match(/([A-Z]+[\+-][0-9]+.*)/)[1];
            }
            if (data.data[timePath + 'owner'] &&
                data.data[timePath + 'owner'].hasOwnProperty('TimeOwner')) {
              $scope.time.owner =
                  data.data[timePath + 'owner'].TimeOwner.split('.').pop();
            }
            if (data.data[timePath + 'sync_method'] &&
                data.data[timePath + 'sync_method'].hasOwnProperty(
                    'TimeSyncMethod')) {
              $scope.time.mode = data.data[timePath + 'sync_method']
                                     .TimeSyncMethod.split('.')
                                     .pop();
            }
          },
          function(error) {
            console.log(JSON.stringify(error));
          });

      var getNTPPromise = APIUtils.getNTPServers().then(
          function(data) {
            $scope.ntp.servers = data.data;
          },
          function(error) {
            console.log(JSON.stringify(error));
          });

      var promises = [
        getTimePromise,
        getNTPPromise,
      ];

      $q.all(promises).finally(function() {
        $scope.loading = false;
      });

      $scope.setTime = function() {
        $scope.error = false;
        $scope.success = false;
        $scope.loading = true;
        var promises = [setTimeMode(), setTimeOwner(), setNTPServers()];

        $q.all(promises).then(
            function() {
              // Have to set the time mode and time owner first to avoid a
              // insufficient permissions if the time mode or time owner had
              // changed.
              var manual_promises = [];
              if ($scope.time.mode == 'Manual') {
                // If owner is 'Split' set both.
                // If owner is 'Host' set only it.
                // Else set BMC only. See:
                // https://github.com/openbmc/phosphor-time-manager/blob/master/README.md
                if ($scope.time.owner != 'Host') {
                  manual_promises.push(
                      setBMCTime($scope.bmc.date.getTime() * 1000));
                }
                // Even though we are setting Host time, we are setting from
                // the BMC date and time fields labeled "BMC and Host Time"
                // currently.
                if ($scope.time.owner == 'Host') {
                  manual_promises.push(
                      setHostTime($scope.bmc.date.getTime() * 1000));
                }
              }
              // Set the Host if Split even if NTP. In split mode, the host has
              // its own date and time field. Set from it.
              if ($scope.time.owner == 'Split') {
                manual_promises.push(
                    setHostTime($scope.host.date.getTime() * 1000));
              }

              $q.all(manual_promises)
                  .then(
                      function() {
                        $scope.success = true;
                      },
                      function(errors) {
                        console.log(JSON.stringify(errors));
                        $scope.error = true;
                      })
                  .finally(function() {
                    $scope.loading = false;
                  });
            },
            function(errors) {
              console.log(JSON.stringify(errors));
              $scope.error = true;
              $scope.loading = false;
            });
      };
      $scope.refresh = function() {
        $route.reload();
      };

      $scope.addNTPField = function() {
        $scope.ntp.servers.push('');
      };

      $scope.removeNTPField = function(index) {
        $scope.ntp.servers.splice(index, 1);
      };

      function setNTPServers() {
        // Remove any empty strings from the array. Important because we add an
        // empty string to the end so the user can add a new NTP server, if the
        // user doesn't fill out the field, we don't want to add.
        $scope.ntp.servers = $scope.ntp.servers.filter(Boolean);
        // NTP servers does not allow an empty array, since we remove all empty
        // strings above, could have an empty array. TODO: openbmc/openbmc#3240
        if ($scope.ntp.servers.length == 0) {
          $scope.ntp.servers.push('');
        }
        return APIUtils.setNTPServers($scope.ntp.servers);
      }

      function setTimeMode() {
        return APIUtils.setTimeMode(
            'xyz.openbmc_project.Time.Synchronization.Method.' +
            $scope.time.mode);
      }

      function setTimeOwner() {
        return APIUtils.setTimeOwner(
            'xyz.openbmc_project.Time.Owner.Owners.' + $scope.time.owner);
      }

      function setBMCTime(time) {
        // Add the separate date and time objects and convert to Epoch time in
        // microseconds.
        return APIUtils.setBMCTime(time);
      }

      function setHostTime(time) {
        // Add the separate date and time objects and convert to Epoch time
        // microseconds.
        return APIUtils.setHostTime(time);
      }
    }
  ]);
})(angular);
