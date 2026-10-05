# IMG_0120 solution — regression fixture

Human-readable record of the solver output for the Tree puzzle state
recognised from `tree-mobile-img0120.png`. The solver test parses the
numbered tap lines below and fails if the solver output changes.
To verify manually in OSRS: starting from the board below, tap each tile
number in order (`.` is the blank).

Starting board:

      1  8  2  4  .
     11  6  3  9  5
     22 12 19 14 10
     21  7 13 24 15
     17 16 18 23 20

Solver: staged exact search, orientation **rows-first**, 50 taps
(rows-first 50, columns-first 68).

Taps (tile to tap, in order):

 1. tap 5
 2. tap 10
 3. tap 14
 4. tap 19
 5. tap 12
 6. tap 6
 7. tap 8
 8. tap 2
 9. tap 3
10. tap 8
11. tap 6
12. tap 7
13. tap 16
14. tap 17
15. tap 21
16. tap 16
17. tap 7
18. tap 22
19. tap 11
20. tap 6
21. tap 8
22. tap 12
23. tap 22
24. tap 7
25. tap 13
26. tap 22
27. tap 12
28. tap 8
29. tap 7
30. tap 12
31. tap 19
32. tap 24
33. tap 23
34. tap 18
35. tap 22
36. tap 13
37. tap 17
38. tap 22
39. tap 18
40. tap 23
41. tap 24
42. tap 19
43. tap 13
44. tap 18
45. tap 23
46. tap 24
47. tap 19
48. tap 14
49. tap 15
50. tap 20

Final board:

      1  2  3  4  5
      6  7  8  9 10
     11 12 13 14 15
     16 17 18 19 20
     21 22 23 24  .
