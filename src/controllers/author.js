const countDecimals = (a) => {
  if (a === null) return a;
  a = String(a)
    .match(/[\d\.]+/g)
    .join(''); // just dots and digits
  const parts = a.split('.');
  return parts.length > 2
    ? undefined
    : parts.length === 1 ? 0 : parts[1].length;
};

export default ($scope, $rootScope, $routeParams, $timeout, $q, $location, $window, $uibModal, $filter, steemService, steemAuthenticatedService, activeUsername, constants) => {
  let username = $routeParams.username;
  let section = $routeParams.section || 'blog';

  $scope.authorData = null;
  $scope.loadingAuthor = false;
  $scope.visitorData = null;
  $scope.loadingVisitor = false;
  $scope.isMyPage = username === activeUsername();

  $scope.dataList = $rootScope.Data['dataList'] || [];
  $scope.loadingContents = false;

  $scope.$watchCollection('authorData', (n, o) => {
    // Persist author data
    if (n === o) {
      return;
    }

    $rootScope.lastAuthorData = n;
  });

  $scope.$watchCollection('visitorData', (n, o) => {
    // Persist visitor data
    if (n === o) {
      return;
    }

    $rootScope.visitorData = n;
  });

  $scope.$watchCollection('dataList', (n, o) => {
    if (n === o) {
      return;
    }

    $rootScope.setNavVar('dataList', n);
  });

  const loadAccount = async (refresh = false) => {
    $scope.loadingAuthor = true;
    $scope.$applyAsync();

    let account = null;

    if (!refresh && $rootScope.lastAuthorData && $rootScope.lastAuthorData.name === username) {
      account = $rootScope.lastAuthorData;
    } else {
      account = await steemService.getAccounts([username]).then(resp => {
        if (resp.length > 0) {
          return resp[0];
        }
        return undefined;
      }).catch((e) => {
        // TODO: Show error
        return null;
      })
    }

    if (account) {
      if (account._merged_ === undefined) {
        account.profile = {};

        try {
          let profile = JSON.parse(account.json_metadata).profile;
          angular.extend(account.profile, profile);
        } catch (e) {
        }

        let resp = await steemService.getFollowCount(username).then(resp => {
          return resp;
        }).catch((e) => {
          // TODO: Show error
          return null;
        });

        if (resp) {
          account.follower_count = resp.follower_count;
          account.following_count = resp.following_count;
          account._merged_ = true;
        }
      }
    }

    $scope.authorData = account;
    $scope.loadingAuthor = false;
    $scope.$applyAsync();
  };

  const loadVisitor = async (refresh = false) => {
    $scope.loadingVisitor = true;

    let visitorName = activeUsername();

    $scope.visitorData = {
      username: username,
      following: false,
      muted: false,
      canFollow: true,
      canUnfollow: false,
      canMute: false,
      canUnmute: false
    };

    $scope.$applyAsync();

    if (visitorName) {
      if (!refresh && $rootScope.visitorData && $rootScope.visitorData.username === username) {
        // Read from root scope. Helper for keep visitor data between sections.

        $scope.visitorData = $rootScope.visitorData;
      } else {
        $scope.visitorUsername = visitorName;

        $scope.$applyAsync();

        let following = false;
        let muted = false;

        // Is following
        let resp = await steemService.getFollowing(visitorName, username, 'blog', 1).then((resp) => {
          return resp;
        }).catch((e) => {
          // TODO: Handle error
        });

        if (resp && resp.length > 0) {
          if (resp[0].follower === visitorName && resp[0].following === username) {
            following = true;
          }
        }

        // Is muted
        resp = await steemService.getFollowing(visitorName, username, 'ignore', 1).then((resp) => {
          return resp;
        }).catch((e) => {
          // TODO: Handle error
        });

        if (resp && resp.length > 0) {
          if (resp[0].follower === visitorName && resp[0].following === username) {
            muted = true;
          }
        }

        $scope.visitorData = {
          username: username,
          following: following,
          muted: muted,
          canFollow: !following,
          canUnfollow: following,
          canMute: !muted,
          canUnmute: muted
        };
      }
      $scope.$applyAsync();
    }

    $scope.loadingVisitor = false;
  };

  let contentIds = [];
  let hasMoreContent = true;

  const loadContentsFirst = () => {
    $scope.loadingContents = true;
    $scope.$applyAsync();

    let statePath = null;
    switch (section) {
      case 'blog':
        statePath = '';
        break;
      case 'comments':
        statePath = 'comments';
        break;
      case 'replies':
        statePath = 'recent-replies';
        break;
    }

    steemService.getState(`/@${username}/${statePath}`).then(resp => {
      for (let k in resp.content) {
        let i = resp.content[k];

        if (contentIds.indexOf(i.id) === -1) {
          $scope.dataList.push(i);
        }
        contentIds.push(i.id);
      }

      // Sort list items by id
      $scope.dataList.sort(function (a, b) {
        let keyA = a.id,
          keyB = b.id;

        if (keyA > keyB) return -1;
        if (keyA < keyB) return 1;
        return 0;
      });

    }).catch((e) => {
      // TODO: Handle catch
    }).then(() => {

      $scope.loadingContents = false;
    });
  };

  const loadContentsOnScroll = (startAuthor = null, startPermalink = null) => {

    $scope.loadingContents = true;

    let prms = null;

    switch (section) {
      case 'blog':
        prms = steemService.getDiscussionsBy('Blog', username, startAuthor, startPermalink, constants.postListSize);
        break;
      case 'comments':
        prms = steemService.getDiscussionsBy('Comments', username, startAuthor, startPermalink, constants.postListSize);
        break;
      case 'replies':
        prms = steemService.getRepliesByLastUpdate(startAuthor, startPermalink, constants.postListSize);
        break;
    }

    prms.then((resp) => {

      // if server returned less than 2 posts, it means end of pagination
      // comparison value is 2 because steem api returns at least 1 post on pagination
      if (resp.length < 2) {
        hasMoreContent = false;
        return false;
      }

      resp.forEach((i) => {
        if (contentIds.indexOf(i.id) === -1) {
          $scope.dataList.push(i);
        }
        contentIds.push(i.id);
      });

    }).catch((e) => {

      // TODO: Handle catch
    }).then(() => {

      $scope.loadingContents = false;
    });
  };

  const loadContents = () => {

    if (['blog', 'comments', 'replies'].indexOf(section) !== -1) {
      if ($scope.dataList.length === 0) {
        // if initial data is empty then load contents
        loadContentsFirst();
      } else {
        // else count ids
        $scope.dataList.forEach((i) => {
          contentIds.push(i.id);
        })
      }
    }

    if (section === 'wallet') {

      $scope.has_unclaimed_rewards = ($scope.authorData.reward_steem_balance.split(' ')[0] > 0) ||
        ($scope.authorData.reward_sbd_balance.split(' ')[0] > 0) ||
        ($scope.authorData.reward_vesting_steem.split(' ')[0] > 0);


      loadTransactions();
    }

  };

  loadAccount().then(() => {
    // console.log("account data ok");
    loadVisitor().then(() => {
      // console.log("visitor data ok");
    });

    loadContents();
  });

  const loadTransactions = () => {
    $scope.loadingContents = true;
    steemService.getState(`/@${username}/transfers`).then(resp => {
      if (resp.accounts[username]) {
        let transfers = resp.accounts[username].transfer_history.slice(Math.max(resp.accounts[username].transfer_history.length - 100, 0));
        $scope.dataList = transfers;
      }
    }).catch((e) => {
      // TODO: Handle catch
    }).then(() => {
      $scope.loadingContents = false;
    });
  };

  $scope.changeSection = (section) => {
    $location.path(`/account/${username}/${section}`);
  };

  $scope.reload = () => {
    if ($scope.loadingRest) {
      return false;
    }

    $scope.dataList = [];
    if (section === 'wallet') {
      loadTransactions();
    } else {
      contentIds = [];
      loadContentsFirst();
    }
  };

  $scope.reachedBottom = () => {
    if (section === 'wallet') {
      return false;
    }

    if ($scope.loadingContents || !hasMoreContent) {
      return false;
    }

    let lastPost = [...$scope.dataList].pop();
    loadContentsOnScroll(lastPost.author, lastPost.permlink)
  };

  $scope.section = section;
  $scope.username = username;

  // Can be deleted in the future after locale files changed.
  $scope.translationData = {platformname: 'Steem', platformsunit: "$1.00", platformpower: "Steem Power"};

  const afterFollow = () => {
    $scope.visitorData.following = true;
    $scope.visitorData.muted = false;
    $scope.visitorData.canFollow = false;
    $scope.visitorData.canUnfollow = true;
    $scope.visitorData.canMute = true;
    $scope.visitorData.canUnmute = false;
  };

  $scope.follow = () => {
    $scope.vBlockControl = true;
    $scope.vFollowing = true;
    steemAuthenticatedService.follow(username).then((resp) => {
      afterFollow();
    }).catch((e) => {
      // TODO: handle error
      console.log(e)
    }).then(() => {
      $scope.vBlockControl = false;
      $scope.vFollowing = false;
    })
  };

  const afterUnfollow = () => {
    $scope.visitorData.following = false;
    $scope.visitorData.muted = false;
    $scope.visitorData.canFollow = true;
    $scope.visitorData.canUnfollow = false;
    $scope.visitorData.canMute = true;
    $scope.visitorData.canUnmute = false;
  };

  $scope.unfollow = () => {
    $scope.vBlockControl = true;
    $scope.vUnfollowing = true;
    steemAuthenticatedService.unfollow(username).then((resp) => {
      afterUnfollow();
    }).catch((e) => {
      // TODO: handle error
    }).then(() => {
      $scope.vBlockControl = false;
      $scope.vUnfollowing = false;
    });
  };

  const afterMute = () => {
    $scope.visitorData.following = false;
    $scope.visitorData.muted = true;
    $scope.visitorData.canFollow = true;
    $scope.visitorData.canUnfollow = false;
    $scope.visitorData.canMute = false;
    $scope.visitorData.canUnmute = true;
  };

  $scope.mute = () => {
    $scope.vBlockControl = true;
    $scope.vMuting = true;
    steemAuthenticatedService.mute(username).then((resp) => {
      afterMute();
    }).catch((e) => {
      // TODO: handle error
    }).then(() => {
      $scope.vBlockControl = false;
      $scope.vMuting = false;
    })
  };

  const afterUnmute = () => {
    $scope.visitorData.following = false;
    $scope.visitorData.muted = false;
    $scope.visitorData.canFollow = true;
    $scope.visitorData.canUnfollow = false;
    $scope.visitorData.canMute = true;
    $scope.visitorData.canUnmute = false;
  };

  $scope.unMute = () => {
    $scope.vBlockControl = true;
    $scope.vUnmuting = true;
    steemAuthenticatedService.unfollow(username).then((resp) => {
      afterUnmute();
    }).catch((e) => {
      // TODO: handle error
    }).then(() => {
      $scope.vBlockControl = false;
      $scope.vUnmuting = false;
    });
  };

  $rootScope.$on('userLoggedIn', () => {
    loadVisitor(true);
    $scope.isMyPage = username === activeUsername();
  });

  $rootScope.$on('userLoggedOut', () => {
    loadVisitor(true);
    $scope.isMyPage = false;
  });

  $scope.transferClicked = (asset) => {

    $uibModal.open({
      templateUrl: `templates/transfer-modal.html`,
      controller: transferModalController,
      windowClass: 'wallet-transfer-modal',
      resolve: {
        initialAsset: () => {
          return asset;
        },
        afterTransfer: () => {
          return () => {
            loadAccount(true).then(() => {
              loadContents();
            });
          }
        }
      }
    }).result.then((data) => {
      // Success
    }, () => {
      // Cancel
    });

  }
};


const transferModalController = ($scope, $rootScope, $filter, $uibModalInstance, steemService, steemAuthenticatedService, userService, activeUsername, initialAsset, afterTransfer) => {

  const accountList = userService.getAll();

  $scope.accountList = accountList.map(x => x.username);
  $scope.account = null;
  $scope.from = activeUsername();

  $scope.to = '';
  $scope.amount = '0.001';
  $scope.asset = initialAsset;
  $scope.memo = '';
  $scope.keyRequired = false;
  $scope.balance = '0';

  $scope.toErr = null;
  $scope.amountErr = null;

  $scope.fromChanged = () => {
    $scope.keyRequired = false;
    for (let a of accountList) {
      if (a.type === 's' && a.username === $scope.from && !a.keys.active) {
        $scope.keyRequired = true;
      }
    }
    loadAccount();
  };

  $scope.toChanged = () => {
    $scope.toErr = null;
  };

  $scope.amountChanged = () => {
    $scope.amountErr = null;

    if (!/^\d+(\.\d+)?$/.test($scope.amount)) {
      $scope.amountErr = 'Wrong amount value';
      return;
    }

    const dotParts = $scope.amount.split('.');

    if (dotParts.length > 1) {
      const precision = dotParts[1];
      if (precision.length > 3) {
        $scope.amountErr = 'Use only 3 digits of precison';
        return;
      }
    }

    if (parseFloat($scope.amount) > parseFloat($scope.balance)) {
      $scope.amountErr = 'Insufficient funds';
      return;
    }
  };

  $scope.assetChanged = (a) => {
    $scope.asset = a;
    $scope.balance = getBalance(a);
    $scope.amountChanged();
  };

  const loadAccount = () => {
    $scope.fetching = true;

    steemService.getAccounts([$scope.from]).then((resp) => {
      return resp[0];
    }).catch((e) => {
      $scope.close();
      $rootScope.showError(e);
    }).then((resp) => {
      $scope.fetching = false;
      $scope.account = resp;
      $scope.balance = getBalance($scope.asset);
      $scope.amountChanged();
    });
  };

  const getBalance = (asset) => {
    const k = (asset === 'STEEM' ? 'balance' : 'sbd_balance');
    return $scope.account[k].split(' ')[0];
  };

  loadAccount();

  $scope.canSend = () => {
    return $scope.to && !$scope.toErr && !$scope.amountErr && !$scope.fetching;
  };

  $scope.send = async () => {

    const to = $scope.to.trim();

    $scope.processing = true;

    const account = await steemService.getAccounts([to]).then((resp) => {
      return resp[0];
    }).catch((e) => {
      $rootScope.showError(e);
    });

    if (!account) {
      $scope.toErr = $filter('translate')('NONEXIST_USER');
      $scope.processing = false;
      $scope.$applyAsync();
      return;
    }

    const m = `${$scope.amount} ${$scope.asset}`;

    // console.log($scope.from);
    // console.log($scope.to);
    // console.log(m);
    // console.log($scope.memo);

    steemAuthenticatedService.transfer($scope.from, $scope.to, m, $scope.memo).then((resp) => {
      return resp;
    }).catch((e) => {
      $rootScope.showError(e);
    }).then((resp) => {
      console.log(resp);
      afterTransfer();
      $scope.close();
      $rootScope.showSuccess($filter('translate')('TX_BROADCASTED'));
      $scope.processing = false;
    });
  };




  $scope.close = () => {
    $uibModalInstance.dismiss('cancel');
  };
};
